DM is hidden from public tabs, folders and media lists. `/dm` no longer renders the DM page. Admin photo/video filters default to DM unchecked; the admin DM tab remains available.

Database enforcement is prepared in `scripts/dm-private-access.sql` but has not been applied. Run it in Supabase SQL Editor before treating DM as private. It restricts SELECT on DM tables and DM photo/video records to the configured administrator, including when older public SELECT policies remain.

Media currently uses public URLs on media.riwooarchive.com. Database policies cannot revoke an already known image/video URL. Full media privacy additionally requires private storage and authenticated delivery (or signed URLs), and revoking existing public DM URLs. This storage migration has not been performed.
