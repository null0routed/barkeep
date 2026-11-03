#!/usr/bin/env bash
# deploy/vps-setup.sh — one-command provisioning of the barkeep CD target VPS.
#
# Makes the host a blue/green deploy target for .github/workflows/deploy.yml:
#   1. `barkeep` system user on a REAL POSIX shell (dash) — sshd runs each forced
#      command through the login shell, so `nologin` breaks every forced command
#      (proven: nologin printed "This account is currently not available."). Access
#      is still impossible without a key: authorized_keys holds ONLY the forced-
#      command keys below, none of which grants a shell.
#   2. /var/lib/barkeep/{blue,green} release slots
#      (seeded from the live site on FIRST run, so generation N-1 exists for rollback)
#   3. /var/www/<domain>/web symlink  — plus the ONE nginx change: root /var/www/<domain>/
#   4. /usr/local/bin/barkeep-rsyncd   (COLD key:    rsync into the COLD slot only)
#   5. /usr/local/bin/barkeep-promote  (PROMOTE key: link the live dir to the COLD slot)
#   6. /usr/local/bin/barkeep-smoke    (SMOKE key:   read-only verify the live slot)
#   7. /etc/sudoers.d/barkeep          (exactly the two `ln` literals, nothing else)
#   8. /home/barkeep/.ssh/authorized_keys (the three purpose keys, passed in via env)
#
# Properties:
#   * Idempotent — safe to re-run after a VPS move or requirement expansion.
#   * Guarded — validates the host (webroot, nginx vhost, key shapes) and REFUSES
#     to edit anything it does not recognize. Backs up the nginx file before sed.
#   * Zero general access — after this, `barkeep` cannot shell, cannot read outside
#     the two content dirs, and has sudo for exactly two fixed `ln` commands.
#
# Usage (from any machine that can SSH to the VPS through your Cloudflare Access app):
#
#   # on this machine (keys generated locally; privates never leave your machine/repo secrets):
#   ssh-keygen -t ed25519 -C barkeep-cold    -f barkeep-cold    -N ""
#   ssh-keygen -t ed25519 -C barkeep-promote -f barkeep-promote -N ""
#
#   # ship the script + the two PUBLIC keys, then run:
#   scp deploy/vps-setup.sh barkeep-cold.pub barkeep-promote.pub you@vps:~/
#   ssh you@vps
#   export BARKEEP_COLD_PUB_KEY="$(cat barkeep-cold.pub)"
#   export BARKEEP_PROMOTE_PUB_KEY="$(cat barkeep-promote.pub)"
#   sudo -E bash vps-setup.sh
#
# Optional env: DOMAIN (default barkeep.cloudkern.com), SSHPORT (default 22).

set -euo pipefail

DOMAIN="${DOMAIN:-barkeep.cloudkern.com}"
SSHPORT="${SSHPORT:-22}"
WEBROOT="/var/www/${DOMAIN}"
LINK="${WEBROOT}/web"
SLOTTEDIR="/var/lib/barkeep"
BLUE="${SLOTTEDIR}/blue"
GREEN="${SLOTTEDIR}/green"

fail() { printf '\033[31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1m[setup]\033[0m %s\n' "$*"; }

# ── 0. preconditions ────────────────────────────────────────────────────────
[ "$(id -u)" = "0" ] || fail "must run as root (sudo -E bash $0)"
command -v rsync  >/dev/null || fail "rsync not found"
command -v nginx  >/dev/null || fail "nginx not found"
[ -d "$WEBROOT" ] || fail "webroot $WEBROOT does not exist — wrong host or DOMAIN"
[ -n "${BARKEEP_COLD_PUB_KEY:-}" ]    || fail "BARKEEP_COLD_PUB_KEY is not set"
[ -n "${BARKEEP_PROMOTE_PUB_KEY:-}" ] || fail "BARKEEP_PROMOTE_PUB_KEY is not set"
[ -n "${BARKEEP_SMOKE_PUB_KEY:-}" ]   || fail "BARKEEP_SMOKE_PUB_KEY is not set"
[[ "$BARKEEP_COLD_PUB_KEY"    =~ ^[[:space:]]*ssh-(ed25519|rsa|ecdsa)[[:space:]] ]] || fail "cold key: does not look like an OpenSSH public key"
[[ "$BARKEEP_PROMOTE_PUB_KEY" =~ ^[[:space:]]*ssh-(ed25519|rsa|ecdsa)[[:space:]] ]] || fail "promote key: does not look like an OpenSSH public key"
[[ "$BARKEEP_SMOKE_PUB_KEY"   =~ ^[[:space:]]*ssh-(ed25519|rsa|ecdsa)[[:space:]] ]] || fail "smoke key: does not look like an OpenSSH public key"
[ "${BARKEEP_COLD_PUB_KEY}" != "${BARKEEP_PROMOTE_PUB_KEY}" ]   || fail "the public keys must all differ"
[ "${BARKEEP_COLD_PUB_KEY}" != "${BARKEEP_SMOKE_PUB_KEY}" ]     || fail "the public keys must all differ"
[ "${BARKEEP_PROMOTE_PUB_KEY}" != "${BARKEEP_SMOKE_PUB_KEY}" ]  || fail "the public keys must all differ"

# ── 1. dedicated user ───────────────────────────────────────────────────────
# sshd runs each forced `command=` through the login shell, so barkeep MUST have a
# real POSIX shell (not nologin) or every forced command breaks. Access stays locked:
# authorized_keys holds only the fixed-command keys, none of which opens an interactive
# shell (see no-pty / command= restrictions in step 8).
REAL_SHELL="$(command -v dash 2>/dev/null || command -v sh 2>/dev/null)"
[ -n "$REAL_SHELL" ] || fail "neither dash nor sh found — the forced commands need a real login shell"
step "1/8 user 'barkeep' (system, real shell: $REAL_SHELL)"
if id barkeep >/dev/null 2>&1; then
  echo "     already present — ensuring a real POSIX shell ($REAL_SHELL)"
  usermod -s "$REAL_SHELL" barkeep
else
  useradd -r -s "$REAL_SHELL" barkeep
  echo "     created"
fi

# ── 2. release slots ────────────────────────────────────────────────────────
step "2/8 release slots $BLUE / $GREEN"
mkdir -p "$BLUE" "$GREEN"
chown -R barkeep:barkeep "$BLUE" "$GREEN"
echo "     ensured"

slot_empty() { [ -z "$(ls -A "$1" 2>/dev/null)" ]; }

# ── 3. seed slots from the live site (first run only) ───────────────────────
step "3/8 seed slots from live content"
if slot_empty "$BLUE" && slot_empty "$GREEN"; then
  if [ -n "$(ls -A "$WEBROOT" 2>/dev/null | grep -v '^web$' | head -n1 || true)" ]; then
    echo "     both slots empty and live site has content → seeding both (this is the first-generation rollback target)"
    rsync -a --exclude='web' "$WEBROOT/" "$GREEN"/
    rsync -a --exclude='web' "$WEBROOT/" "$BLUE"/
  else
    echo "     WARNING: both slots empty and no live content found either — the site will be empty until the first deploy"
  fi
else
  echo "     slots already have content — leaving untouched"
fi

# ── 4. the active symlink ───────────────────────────────────────────────────
step "4/8 active symlink $LINK"
if [ -L "$LINK" ]; then
  echo "     already a symlink → $(readlink "$LINK") (untouched)"
else
  ln -sfn "$GREEN" "$LINK"
  echo "     created → $GREEN"
fi

# ── 5. nginx: exactly one line, guarded ────────────────────────────────────
step "5/8 nginx root → $LINK"
WEBROOT_RE="$(printf '%s' "$WEBROOT" | sed 's/\./\\./g')"
LINK_RE="$(printf '%s'  "$LINK"    | sed 's/\./\\./g')"
VHOST=""
for d in /etc/nginx/sites-enabled /etc/nginx/conf.d /etc/nginx; do
  [ -d "$d" ] || continue
  f="$(grep -rlsE "server_name[[:space:]]+${DOMAIN}([^[:space:]]|;)" "$d" 2>/dev/null | head -n1 || true)"
  if [ -n "$f" ]; then VHOST="$f"; break; fi
done
[ -n "$VHOST" ] || fail "no nginx vhost for $DOMAIN found — refusing to guess"
echo "     vhost: $VHOST"
if grep -qE "^[[:space:]]*root[[:space:]]+${LINK_RE};?" "$VHOST"; then
  echo "     already serving $LINK — no change"
elif grep -qE "^[[:space:]]*root[[:space:]]+${WEBROOT_RE};?" "$VHOST"; then
  BAK="${VHOST}.barkeep-$(date +%Y%m%d-%H%M%S)"
  cp -a "$VHOST" "$BAK"
  sed -i "s|^\([[:space:]]*\)root[[:space:]]\+${WEBROOT_RE};|\1root ${LINK};|" "$VHOST"
  if ! nginx -t; then
    cp -a "$BAK" "$VHOST"
    fail "nginx -t failed after edit — restored $BAK"
  fi
  echo "     updated (backup: $BAK); reloading nginx"
  systemctl reload nginx
else
  fail "vhost declares neither 'root $WEBROOT' nor 'root $LINK' — refusing to edit; fix the vhost and re-run"
fi

# ── 6. forced-command scripts (the canonical ones; re-run = refresh) ────────
step "6/8 /usr/local/bin/barkeep-{rsyncd,promote}"
cat > /usr/local/bin/barkeep-rsyncd <<'BARKEEP_RS'
#!/bin/sh
# barkeep-rsyncd — forced command for BARKEEP_COLD_SSH_KEY.
# The ONLY thing this key can do: rsync into the currently-COLD slot.
# Slot choice is made here (server-side); OpenSSH command= discards client args.
set -eu
LINK=/var/www/barkeep.cloudkern.com/web
ACTIVE="$(basename "$(readlink "$LINK")")"
case "$ACTIVE" in
  green) COLD=blue ;;
  blue)  COLD=green ;;
  *) exit 1 ;;
esac
# NOTE: canonical receiver line — `--server` (not `--daemon`: the two are
# mutually exclusive and their combination is rejected at rsync arg-parse),
# `-az` matches the client's compression bits, `--delete` makes the incoming
# build the EXACT slot contents (no stale files survive), path is absolute.
exec /usr/bin/rsync --server -az --delete . "/var/lib/barkeep/$COLD"
BARKEEP_RS
chmod 755 /usr/local/bin/barkeep-rsyncd

cat > /usr/local/bin/barkeep-promote <<'BARKEEP_PRO'
#!/bin/sh
# barkeep-promote — forced command for BARKEEP_PROMOTE_SSH_KEY.
# The ONLY thing this key can do: point the nginx root at the COLD slot.
# = deploy promote AND one-generation rollback (same fixed action).
set -eu
LINK=/var/www/barkeep.cloudkern.com/web
ACTIVE="$(basename "$(readlink "$LINK")")"
case "$ACTIVE" in
  green) NEXT=blue ;;
  blue)  NEXT=green ;;
  *) exit 1 ;;
esac
exec sudo -n /usr/bin/ln -sfn "/var/lib/barkeep/$NEXT" "$LINK"
BARKEEP_PRO
chmod 755 /usr/local/bin/barkeep-promote

cat > /usr/local/bin/barkeep-smoke <<'BARKEEP_SMOKE'
#!/bin/sh
# barkeep-smoke — forced command for BARKEEP_SMOKE_SSH_KEY.
# The ONLY thing this key can do: read-only verify that the LIVE link resolves to a
# valid build. No writes, no sudo, and sshd command= discards any client args, so no
# host control. This is the spot a public-URL curl can't reach — the origin — so
# Cloudflare's datacenter-IP challenge is irrelevant here.
set -eu

LINK=/var/www/barkeep.cloudkern.com/web
[ -L "$LINK" ] || { echo "smoke: FAIL — $LINK is not a symlink"; exit 1; }
TARGET="$(readlink -f "$LINK")"
[ -n "$TARGET" ] && [ -d "$TARGET" ] || { echo "smoke: FAIL — $LINK does not resolve to a directory"; exit 1; }
ACTIVE="$(basename "$TARGET")"

# Canonical build markers (same contract as the workflow's "Verify artifact" step),
# checked against the LIVE slot the link now points at:
[ -s "$LINK/index.html" ] || { echo "smoke: FAIL — index.html missing or empty in $ACTIVE"; exit 1; }
[ -d "$LINK/_next" ]      || { echo "smoke: FAIL — _next missing in $ACTIVE"; exit 1; }

NFILES="$(find "$TARGET" -type f | wc -l | tr -d ' ')"
echo "smoke: PASS — live slot: $ACTIVE (dir: $TARGET, files: $NFILES)"
exit 0
BARKEEP_SMOKE
chmod 755 /usr/local/bin/barkeep-smoke

echo "     installed"

# ── 7. sudoers: exactly the two swap literals ───────────────────────────────
step "7/8 /etc/sudoers.d/barkeep"
cat > /etc/sudoers.d/barkeep <<BARKEEP_SUDO
barkeep ALL=(root) NOPASSWD: /usr/bin/ln -sfn ${BLUE} ${LINK}, /usr/bin/ln -sfn ${GREEN} ${LINK}
BARKEEP_SUDO
chmod 440 /etc/sudoers.d/barkeep
VIS=$(visudo -cf /etc/sudoers.d/barkeep 2>&1) || fail "sudoers syntax check failed: $VIS"
echo "     $VIS"

# ── 8. authorized_keys: exactly the two purpose keys ────────────────────────
step "8/8 /home/barkeep/.ssh/authorized_keys"
install -d -m 700 -o barkeep -g barkeep /home/barkeep/.ssh
{
  echo "command=\"/usr/local/bin/barkeep-rsyncd\",no-pty,no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-user-rc ${BARKEEP_COLD_PUB_KEY}"
  echo "command=\"/usr/local/bin/barkeep-promote\",no-pty,no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-user-rc ${BARKEEP_PROMOTE_PUB_KEY}"
  echo "command=\"/usr/local/bin/barkeep-smoke\",no-pty,no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-user-rc ${BARKEEP_SMOKE_PUB_KEY}"
} > /home/barkeep/.ssh/authorized_keys
chmod 600 /home/barkeep/.ssh/authorized_keys
chown barkeep:barkeep /home/barkeep/.ssh/authorized_keys
echo "     written (3 forced-command keys)"

# ── report ──────────────────────────────────────────────────────────────────
printf '\n\033[1m[setup] DONE\033[0m\n'
echo "  active link:  $(readlink -f "$LINK" 2>/dev/null || echo MISSING)"
echo "  blue:         $(du -sh "$BLUE" 2>/dev/null | cut -f1)  green: $(du -sh "$GREEN" 2>/dev/null | cut -f1)"
echo "  nginx:        $(nginx -t 2>&1 | tail -1)"
echo "  smoke:        $(sh /usr/local/bin/barkeep-smoke 2>&1 || echo "smoke: (empty or not yet deployed — OK on first run)")"

echo
echo "── next: capture the pinned host key (GitHub secret BARKEEP_SSH_KNOWN_HOSTS) ─"
# UNHASHED, anchored to the name the runner CONNECTS to ($SSH_HOST, via Cloudflare
# Access) — hashed (-H) pins embed the scanned hostname and would not match.
if [ -n "${BARKEEP_VPS_HOST:-}" ]; then
  PINHOST="$BARKEEP_VPS_HOST"
else
  PINHOST="ssh.cloudkern.com   # = set BARKEEP_VPS_HOST to the name you SSH to (your .ssh/config HostName)"
  PINHOST="${PINHOST%%   *}"
fi
if command -v ssh-keyscan >/dev/null 2>&1; then
  echo "$PINHOST-pinned lines (paste all of them into the GitHub secret):"
  ssh-keyscan -p "$SSHPORT" 127.0.0.1 2>/dev/null | sed "s|^127\.0\.0\.1|$PINHOST|"
else
  echo "  ssh-keyscan not found on this host — run: ssh-keyscan -p $SSHPORT <BARKEEP_VPS_HOST>"
fi

echo
echo "── verify from a machine holding the private keys (in order) ─────────────────"
cat <<'NEXT'
  1) cold-write + readback + delete (proves key 1; writes ONLY into the cold slot)
       echo deploy-smoke > /tmp/barkeep-smoke
       rsync -e "ssh -i barkeep-cold -o StrictHostKeyChecking=yes -o UserKnownHostsFile=<(echo \"\$BARKEEP_SSH_KNOWN_HOSTS\")" \
             /tmp/barkeep-smoke barkeep@<vps-host>/
       ls -l /var/lib/barkeep/<cold-slot>/barkeep-smoke   # cold slot = the OTHER one of readlink …/web
       rm          /var/lib/barkeep/<cold-slot>/barkeep-smoke
  2) promote + confirm the site is still 200 at https://barkeep.cloudkern.com/
       ssh -i barkeep-promote -o … barkeep@<vps-host> /bin/true
       readlink /var/www/barkeep.cloudkern.com/web          # must now be the OTHER slot
  3) smoke — read-only verify the live slot, from the origin (Cloudflare can't challenge this)
        ssh -i barkeep-smoke -o … barkeep@<vps-host> /bin/true   # expect "smoke: PASS — live slot: …"
  4) promote again → flips back; both slots still hold the identical current site
NEXT
