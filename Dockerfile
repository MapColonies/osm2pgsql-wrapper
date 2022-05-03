ARG NODE_VERSION=16

FROM ubuntu:20.04 as build

ENV DEBIAN_FRONTEND=noninteractive
ARG OSM2PGSQL_TAG=1.5.1
ARG OSMIUM_TOOL_TAG=v1.13.2
ARG PROTOZERO_TAG=v1.7.0
ARG LIBOSMIUM_TAG=v2.17.2

RUN apt-get -y update && apt -y install \
  make \
  cmake \
  g++ \
  libboost-dev \
  libboost-system-dev \
  libboost-filesystem-dev \
  libexpat1-dev \
  zlib1g-dev \
  libbz2-dev \
  libpq-dev \
  libproj-dev \
  liblua5.3-dev \
  pandoc \
  git-core \
  libboost-program-options-dev

RUN git clone -b ${OSM2PGSQL_TAG} --single-branch https://github.com/openstreetmap/osm2pgsql.git ./osm2pgsql && \
  cd osm2pgsql && \
  mkdir build && \
  cd build && \
  cmake .. && \
  make && \
  make install

RUN git clone -b ${OSMIUM_TOOL_TAG} --single-branch https://github.com/osmcode/osmium-tool ./osmium-tool && \
  git clone -b ${PROTOZERO_TAG} --single-branch https://github.com/mapbox/protozero ./protozero && \
  git clone -b ${LIBOSMIUM_TAG} --single-branch https://github.com/osmcode/libosmium ./libosmium && \
  cd osmium-tool && \
  mkdir build && \
  cd build && \
  cmake .. && \
  make

FROM node:${NODE_VERSION} as buildApp

WORKDIR /tmp/buildApp

COPY ./package*.json ./

RUN npm install
COPY . .
RUN npm run build

FROM ubuntu:20.04 as production

ENV DEBIAN_FRONTEND=noninteractive
ENV workdir /app
ARG NODE_VERSION

WORKDIR ${workdir}

COPY --from=build /osm2pgsql/build /osm2pgsql
COPY --from=build /osmium-tool/build /osmium-tool/build
RUN ln -s /osm2pgsql/osm2pgsql /bin/osm2pgsql && ln -s /osmium-tool/build/osmium /bin/osmium

RUN apt-get update \
    && apt-get -yq install curl \
    && curl -L https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash \
    && apt-get -yq install nodejs libboost-filesystem-dev libpq-dev libproj-dev liblua5.3-dev libboost-program-options-dev

COPY ./package*.json ./

RUN npm ci --only=production

COPY --from=buildApp /tmp/buildApp/dist .
COPY ./config ./config
COPY start.sh .

RUN chgrp root ${workdir}/start.sh && chmod -R a+rwx ${workdir} && \
    mkdir /.postgresql && chmod g+w /.postgresql

# uncomment while developing to make sure the docker runs on openshift
# RUN useradd -ms /bin/bash user && usermod -a -G root user
# USER user

ENTRYPOINT [ "/app/start.sh" ]
