# CodeFlow on TrueNAS

This deploys CodeFlow as a TrueNAS SCALE Custom App backed by `nginx:alpine`.

The app stays interactive in the browser because it serves the UI and proxies Forgejo API calls through the same origin at `/forgejo-api`. That avoids the usual CORS breakage you get when a browser app on one port calls Forgejo on another port.

## Expected local layout

Clone or sync this repository into the existing `apps/devtools` dataset:

```sh
git clone http://192.168.1.134:30142/mmarinucci/codeflow-orig /mnt/apps/devtools/codeflow
```

If the repo already exists elsewhere, copy these paths into `/mnt/apps/devtools/codeflow`:

- `index.html`
- `src/`
- `deploy/truenas/config.js.template`
- `deploy/truenas/nginx.conf.template`
- `deploy/truenas/docker-compose.yml`
- `deploy/truenas/deploy_custom_app.sh`

## Current TrueNAS assumptions

These values match the infrastructure documented in `~/TRUENAS`:

- Forgejo web: `http://192.168.1.134:30142`
- CodeFlow app port: `30146`
- App files dataset: `/mnt/apps/devtools/codeflow`

## Install as a Custom App

The preferred path is the included deploy script, because it keeps the app registered in the TrueNAS app subsystem and makes redeploys reproducible.

```sh
./deploy/truenas/deploy_custom_app.sh
```

This script:

- syncs the app assets to `/mnt/apps/devtools/codeflow`
- renders `config.js` and `nginx.conf` from templates
- pulls the Forgejo token from macOS Keychain service `TrueNAS-Forgejo-Token` unless `FORGEJO_TOKEN` is set
- creates the `codeflow` custom app if missing
- updates the existing `codeflow` app if it already exists

### Manual install

1. In TrueNAS SCALE, go to `Apps`.
2. Choose `Discover Apps`.
3. Choose `Custom App`.
4. Choose `Install via YAML`.
5. Paste the contents of [docker-compose.yml](/Users/numinate/PY/codeflow-orig/deploy/truenas/docker-compose.yml).
6. Save and start the app.

Open:

```text
http://192.168.1.134:30146
```

## What the container does

The TrueNAS app mounts only:

- `index.html`
- `src/`
- generated `deploy/truenas/config.js`
- generated `deploy/truenas/nginx.conf`

It does not expose the rest of the git checkout over HTTP.

Private repo analysis can use the server-side Forgejo token injected by the local reverse proxy, so the browser does not need to paste a token for normal use on this NAS.

## Updating the app

Run:

```sh
./deploy/truenas/deploy_custom_app.sh
```

If you want a stable public URL, add an Nginx Proxy Manager host entry that forwards to `http://192.168.1.134:30146`.
