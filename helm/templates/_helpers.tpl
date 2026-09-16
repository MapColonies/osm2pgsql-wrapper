{{/*
Expand the name of the chart.
*/}}
{{- define "osm2pgsql-wrapper.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "osm2pgsql-wrapper.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "osm2pgsql-wrapper.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "osm2pgsql-wrapper.labels" -}}
helm.sh/chart: {{ include "osm2pgsql-wrapper.chart" . }}
{{ include "osm2pgsql-wrapper.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Returns the tag of the chart.
*/}}
{{- define "osm2pgsql-wrapper.tag" -}}
{{- default (printf "v%s" .Chart.AppVersion) .Values.image.tag }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "osm2pgsql-wrapper.selectorLabels" -}}
app.kubernetes.io/name: {{ include "osm2pgsql-wrapper.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Returns the environment from global if exists or from the chart's values, defaults to development
*/}}
{{- define "osm2pgsql-wrapper.environment" -}}
{{- if .Values.global.environment }}
    {{- .Values.global.environment -}}
{{- else -}}
    {{- .Values.environment | default "development" -}}
{{- end -}}
{{- end -}}

{{/*
Returns the cloud provider name from global if exists or from the chart's values, defaults to minikube
*/}}
{{- define "osm2pgsql-wrapper.cloudProviderFlavor" -}}
{{- if .Values.global.cloudProvider.flavor }}
    {{- .Values.global.cloudProvider.flavor -}}
{{- else if .Values.cloudProvider -}}
    {{- .Values.cloudProvider.flavor | default "minikube" -}}
{{- else -}}
    {{ "minikube" }}
{{- end -}}
{{- end -}}

{{/*
Returns the cloud provider docker registry url from global if exists or from the chart's values
*/}}
{{- define "osm2pgsql-wrapper.cloudProviderDockerRegistryUrl" -}}
{{- if .Values.global.cloudProvider.dockerRegistryUrl }}
    {{- printf "%s/" .Values.global.cloudProvider.dockerRegistryUrl -}}
{{- else if .Values.cloudProvider.dockerRegistryUrl -}}
    {{- printf "%s/" .Values.cloudProvider.dockerRegistryUrl -}}
{{- else -}}
{{- end -}}
{{- end -}}

{{/*
Returns the cloud provider image pull secret name from global if exists or from the chart's values
*/}}
{{- define "osm2pgsql-wrapper.cloudProviderImagePullSecretName" -}}
{{- if .Values.global.cloudProvider.imagePullSecretName }}
    {{- .Values.global.cloudProvider.imagePullSecretName -}}
{{- else if .Values.cloudProvider.imagePullSecretName -}}
    {{- .Values.cloudProvider.imagePullSecretName -}}
{{- end -}}
{{- end -}}

{{/*
Returns the tracing url from global if exists or from the chart's values
*/}}
{{- define "osm2pgsql-wrapper.tracingUrl" -}}
{{- if .Values.global.tracing.url }}
    {{- .Values.global.tracing.url -}}
{{- else if .Values.cloudProvider -}}
    {{- .Values.env.tracing.url -}}
{{- end -}}
{{- end -}}

{{/*
Returns the tracing url from global if exists or from the chart's values
*/}}
{{- define "osm2pgsql-wrapper.metricsUrl" -}}
{{- if .Values.global.metrics.url }}
    {{- .Values.global.metrics.url -}}
{{- else -}}
    {{- .Values.env.metrics.url -}}
{{- end -}}
{{- end -}}

{{/*
The osm2pgsql-wrapper app container spec, used from templates/job.yaml under `containers:`
normally, or under `initContainers:` when cli.create.primaryKeys is set (see that file's
comment) -- Kubernetes only orders initContainers before regular containers, never sibling
regular containers against each other, so the primary-key fix needs this container to run
as an initContainer to guarantee it finishes before the fix runs. Pulled into a shared
template so both call sites render byte-identical output instead of drifting apart.
*/}}
{{- define "osm2pgsql-wrapper.appContainer" -}}
{{- $releaseName := .Release.Name -}}
{{- $chartName := include "osm2pgsql-wrapper.name" . -}}
{{- $cloudProviderDockerRegistryUrl := include "osm2pgsql-wrapper.cloudProviderDockerRegistryUrl" . -}}
{{- $imageTag := include "osm2pgsql-wrapper.tag" . -}}
- name: {{ $releaseName }}-{{ $chartName }}-deployment
  {{- with .Values.image }}
  image: {{ $cloudProviderDockerRegistryUrl }}{{ .repository }}:{{ $imageTag }}
  imagePullPolicy: {{ .pullPolicy | default "IfNotPresent" }}
  {{- end }}
  args:
    - {{ .Values.cli.command }}
  volumeMounts:
  {{- if eq .Values.cli.command "append" }}
    - name: config-schema
      mountPath: {{ .Values.cli.append.config.mountPath }}
  {{- end }}
  {{- if and (eq .Values.cli.command "create") (eq .Values.cli.create.dumpSourceType "local-file") }}
    - name: dump-data
      mountPath: {{ dir .Values.cli.create.dumpSource }}
  {{- end }}
  {{- if .Values.postgres.sslAuth.enabled }}
    - name: postgres-cert-conf
      mountPath: {{ .Values.postgres.sslAuth.mountPath }}
  {{- end }}
  {{- if .Values.pgboss.sslAuth.enabled }}
    - name: pgboss-cert-conf
      mountPath: {{ .Values.pgboss.sslAuth.mountPath }}
  {{- end }}
  {{- if .Values.caSecretName }}
    - mountPath: {{ printf "%s/%s" .Values.caPath .Values.caKey | quote }}
      name: root-ca
      subPath: {{ quote .Values.caKey }}
    {{- end }}
    {{- if .Values.extraVolumeMounts -}}
      {{ toYaml .Values.extraVolumeMounts | nindent 4 }}
    {{- end }}
  env:
    - name: SERVER_PORT
      value: {{ .Values.env.targetPort | quote }}
    {{- if .Values.caSecretName }}
    - name: REQUESTS_CA_BUNDLE
      value: {{ printf "%s/%s" .Values.caPath .Values.caKey | quote }}
    - name: NODE_EXTRA_CA_CERTS
      value: {{ printf "[%s/%s]" .Values.caPath .Values.caKey | quote }}
    {{- end }}
    {{- if .Values.extraEnvVars }}
    {{- toYaml .Values.extraEnvVars | nindent 4 }}
    {{- end }}
  envFrom:
    - configMapRef:
        name: {{ printf "%s-configmap" (include "osm2pgsql-wrapper.fullname" .) }}
    - configMapRef:
        name: {{ printf "%s-command-options-configmap" (include "osm2pgsql-wrapper.fullname" .) }}
    - configMapRef:
        name: {{ printf "%s-arstotzka-configmap" (include "osm2pgsql-wrapper.fullname" .) }}
    {{- if and .Values.arstotzka.enabled .Values.arstotzka.networkCM }}
    - configMapRef:
        name: {{ .Values.arstotzka.networkCM }}
    {{- end }}
    - secretRef:
        name: {{ printf "%s-secret" (include "osm2pgsql-wrapper.fullname" .) }}
  ports:
    - name: http
      containerPort: {{ .Values.env.targetPort }}
      protocol: {{ .Values.env.protocol }}
  {{- if .Values.resources.enabled }}
  resources:
    {{- toYaml .Values.resources.value | nindent 4 }}
  {{- end }}
{{- end -}}
