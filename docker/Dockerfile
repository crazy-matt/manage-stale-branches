FROM alpine/git:v2.32.0

RUN apk add --no-cache bash coreutils && \
    # --- only for vulnerability patching
    apk add --no-cache expat=2.4.4-r0 && \
    # ---
    rm -rf /var/cache/apk/*

COPY . /run

ENTRYPOINT [ "/run/entrypoint.sh" ]
