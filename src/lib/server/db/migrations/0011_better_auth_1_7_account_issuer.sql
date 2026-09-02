-- Better Auth 1.7 requires account.issuer for provider-scoped identity.
-- Use provider-id strategy: local:credential for email/password, local:oauth:<provider> otherwise.
-- Keep column nullable for existing rows, backfill, then add unique index on (issuer, account_id).

alter table account add column issuer text;

update account set issuer = 'local:credential' where provider_id = 'credential' and issuer is null;
update account set issuer = 'local:oauth:' || provider_id where provider_id != 'credential' and issuer is null;

-- For provider-id strategy credential accounts use user.id as accountId, not email.
update account set account_id = user_id where provider_id = 'credential';

create unique index if not exists account_issuer_account_id_uidx on account(issuer, account_id);
