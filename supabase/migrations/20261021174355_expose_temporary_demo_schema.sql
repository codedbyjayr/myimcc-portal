ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, imcc_review'; NOTIFY pgrst, 'reload config'; NOTIFY pgrst, 'reload schema';

