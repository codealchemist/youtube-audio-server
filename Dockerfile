FROM node:10
WORKDIR /usr/src/yas
RUN npm i -g youtube-audio-server
EXPOSE 80
CMD yas
