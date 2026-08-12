FROM nginx:alpine

# Copy all project files to Nginx web root
COPY . /usr/share/nginx/html

EXPOSE 80