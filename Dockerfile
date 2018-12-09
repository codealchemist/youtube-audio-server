FROM jrottenberg/ffmpeg:3.4-alpine
FROM node:10-alpine

# copy ffmpeg bins from first image
COPY --from=0 / /

WORKDIR /usr/src/yas
RUN npm i -g youtube-audio-server
EXPOSE 80
CMD yas
