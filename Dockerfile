FROM nginx:alpine

# Copy all project files to Nginx web root
COPY . /usr/share/nginx/html

EXPOSE 80

# Inject Portainer environment variables into env-config.js at startup and start Nginx
CMD ["/bin/sh", "-c", "envsubst '$SUPABASE_URL $SUPABASE_ANON_KEY' < /usr/share/nginx/html/env-config.template.js > /usr/share/nginx/html/env-config.js && nginx -g 'daemon off;'"]