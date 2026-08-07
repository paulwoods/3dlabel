FROM nginx:alpine

COPY index.html style.css *.js /usr/share/nginx/html/

EXPOSE 80
