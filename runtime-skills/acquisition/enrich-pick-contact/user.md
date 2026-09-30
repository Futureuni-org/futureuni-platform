# pick-contact user prompt

Service line: {{serviceLine}}
Market: {{market}}
Company size: {{size}}
Role priority: {{#each rolePriority}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}

Candidates:
<untrusted_data source="candidates">
{{#each candidates}}
- id={{this.id}} · name={{this.name}} · role={{this.role}} · emailStatus={{this.emailStatus}} · emailKind={{this.emailKind}} · source={{this.source}}
{{/each}}
</untrusted_data>
