FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 80
EXPOSE 6061

CMD ["node", "index.js"]