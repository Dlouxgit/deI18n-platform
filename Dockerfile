FROM node:22-slim

WORKDIR /usr/src/app

COPY package.json ./
COPY pnpm-lock.yaml ./

RUN npm install -g pnpm

RUN pnpm install

COPY . .

RUN pnpm build

ENV PORT=7999

EXPOSE 7999

CMD ["pnpm", "start"]