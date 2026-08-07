# Pinned rather than floating on `nginx:alpine`: the droplet redeploys by
# pulling this image, and a moving base tag would change the server underneath
# an otherwise unchanged app. `alpine` tracks nginx *mainline*, so this is the
# 1.31 line and not the 1.30 stable line — pinning to `1.30-alpine` would be a
# downgrade, not a freeze.
FROM nginx:1.31-alpine

COPY index.html style.css *.js /usr/share/nginx/html/

# Plain HTTP behind Caddy, which terminates TLS for 3dlabel.mrpaulwoods.com and
# reverse-proxies here by Compose service name.
EXPOSE 80
