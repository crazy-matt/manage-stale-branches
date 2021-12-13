FROM alpine/git

RUN apk update && \
    apk add bash coreutils && \
    rm -rf /var/cache/apk/*

COPY . /run

ENTRYPOINT [ "/run/entrypoint.sh" ]
