{{/*
Chart name. Always returns "homework".
*/}}
{{- define "homework.name" -}}
{{- .Chart.Name -}}
{{- end -}}

{{/*
Fully qualified resource name, component-scoped.
Usage: {{ include "homework.fullname" (dict "context" . "component" "api") }}
Result: "homework-api"

The chart has three workloads (api, web, db) in one release, so resource names
must include the component. The helper takes an explicit dict because Helm's
nested-template calling convention doesn't let us pass both `.` (root context)
and the component name otherwise.
*/}}
{{- define "homework.fullname" -}}
{{- printf "%s-%s" .context.Chart.Name .component -}}
{{- end -}}

{{/*
Standard Helm-recommended labels, component-scoped.
Usage: {{ include "homework.labels" (dict "context" . "component" "api") | nindent 4 }}
*/}}
{{- define "homework.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .context.Chart.Name .context.Chart.Version }}
app.kubernetes.io/name: {{ .context.Chart.Name }}
app.kubernetes.io/instance: {{ .context.Release.Name }}
app.kubernetes.io/component: {{ .component }}
app.kubernetes.io/version: {{ .context.Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .context.Release.Service }}
{{- end -}}

{{/*
Selector labels (subset of labels). Must remain stable across Chart.Version
bumps — used to match a Deployment/StatefulSet's pod selector. Component label
is included so the three workloads don't cross-match each other's pods.
Usage: {{ include "homework.selectorLabels" (dict "context" . "component" "api") | nindent 6 }}
*/}}
{{- define "homework.selectorLabels" -}}
app.kubernetes.io/name: {{ .context.Chart.Name }}
app.kubernetes.io/instance: {{ .context.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}
