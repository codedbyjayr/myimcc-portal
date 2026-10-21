-- Run only after adviser review. No school or demo records are deleted.
BEGIN;
UPDATE imcc_review_private.control SET retired=true,enabled_until=NULL;
REVOKE ALL ON SCHEMA imcc_review,imcc_review_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA imcc_review,imcc_review_private FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
