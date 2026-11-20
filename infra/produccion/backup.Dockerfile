FROM postgres:17-alpine
RUN apk add --no-cache restic
COPY respaldo.sh /usr/local/bin/respaldo
ENTRYPOINT ["respaldo"]
CMD ["programar"]
