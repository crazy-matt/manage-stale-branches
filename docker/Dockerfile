FROM alpine/git:2.36.3

RUN apk add --no-cache bash coreutils && \
    rm -rf /var/cache/apk/*

COPY . /run

ENTRYPOINT [ "/run/entrypoint.sh" ]
