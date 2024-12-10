FROM node:22-slim

WORKDIR /usr/src/app

COPY package.json ./
COPY pnpm-lock.yaml ./

RUN npm install -g pnpm

RUN pnpm install

COPY . .

EXPOSE 7999

CMD ["npm", "run", "dev", "--", "--host", "--port", "7999"]
