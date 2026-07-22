-- Permit current v3 semantic provenance while retaining v2 values on
-- historical analysis records. No record is rewritten.
alter table public.intelligence_analyses
  drop constraint intelligence_analyses_semantic_rule_version_check,
  add constraint intelligence_analyses_semantic_rule_version_check check (
    semantic_rule_version is null or
    semantic_rule_version in (
      'beard-semantic-safety-v2',
      'beard-semantic-safety-v3'
    )
  ),
  drop constraint intelligence_analyses_failure_validator_check,
  add constraint intelligence_analyses_failure_validator_check check (
    failure_validator is null or failure_validator in (
      'responses-envelope','responses-output','json-parser','json-schema',
      'beard-contract','beard-semantic-safety-v2',
      'beard-semantic-safety-v3','legacy-beard-validator'
    )
  );
