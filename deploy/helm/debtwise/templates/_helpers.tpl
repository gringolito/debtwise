{{- define "debtwise.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Truncated to 56, not 63, so the data claim named after it keeps its name across chart upgrades.
*/}}
{{- define "debtwise.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 56 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 56 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 56 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "debtwise.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "debtwise.labels" -}}
helm.sh/chart: {{ include "debtwise.chart" . }}
{{ include "debtwise.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: debtwise
{{- end }}

{{- define "debtwise.selectorLabels" -}}
app.kubernetes.io/name: {{ include "debtwise.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "debtwise.image" -}}
{{ .image.repository }}:{{ .image.tag | default .chart.AppVersion }}
{{- end }}

{{- define "debtwise.claimName" -}}
{{ .Values.persistence.existingClaim | default (printf "%s-data" (include "debtwise.fullname" .)) }}
{{- end }}
