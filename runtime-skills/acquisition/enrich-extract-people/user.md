# extract-people user prompt

Company: {{companyName}}
Service line: {{serviceLine}}
Market: {{market}}

Pages:
{{#each pages}}
<untrusted_data source="{{this.url}}" title="{{this.title}}">
{{this.text}}
</untrusted_data>
{{/each}}
