FROM --platform=$BUILDPLATFORM node:24-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.ts tsconfig.frontend.json ./
COPY auth/ ./auth/
COPY onboarding/ ./onboarding/
COPY admin/ ./admin/
COPY faculty/ ./faculty/
COPY staff/ ./staff/
COPY student/ ./student/
COPY shared/ ./shared/
COPY logo.png ./
COPY scripts/build-demo-assets.mjs ./scripts/build-demo-assets.mjs
RUN npm run build

FROM nginx:alpine
COPY config/nginx.conf /etc/nginx/conf.d/default.conf

# Copy all project files to Nginx web root
COPY . /usr/share/nginx/html
COPY --from=frontend /app/shared/dist /usr/share/nginx/html/shared/dist
COPY --from=frontend /app/review-assets /usr/share/nginx/html/review-assets

EXPOSE 80

# Write window.__ENV__ directly to env-config.js at startup and start Nginx
CMD ["/bin/sh", "-c", "echo \"window.__ENV__ = { SUPABASE_URL: '$SUPABASE_URL', SUPABASE_ANON_KEY: '$SUPABASE_ANON_KEY' };\" > /usr/share/nginx/html/env-config.js && nginx -g 'daemon off;'"]
