FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=30040

EXPOSE 30040

ENTRYPOINT ["./docker-entrypoint.sh"]
