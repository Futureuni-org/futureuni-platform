# src/modules/forms/ui/

`public/` is what a prospect sees at `/f/<slug>`; `internal/` is what the team sees under `/forms`.

Both are driven by the `FormDefinition` contract, and both compose the platform's primitives from
`@/components/ui` rather than defining their own tokens.
