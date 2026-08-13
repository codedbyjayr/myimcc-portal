FROM nginx:alpine

# Copy all project files to Nginx web root
COPY . /usr/share/nginx/html

EXPOSE 80

# Write window.__ENV__ directly to env-config.js at startup and start Nginx
CMD ["/bin/sh", "-c", "echo \"window.__ENV__ = { SUPABASE_URL: '$SUPABASE_URL', SUPABASE_ANON_KEY: '$SUPABASE_ANON_KEY' };\" > /usr/share/nginx/html/env-config.js && nginx -g 'daemon off;'"]