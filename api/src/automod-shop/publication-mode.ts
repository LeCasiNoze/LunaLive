import type {Pool} from 'pg';
/** The scoped VPS service reports its persistent publication owner. */
export async function recordPublicationMode(pool:Pool,streamerId:number,owner:unknown,revision:unknown){
  if(!['manual','automod'].includes(String(owner))||!Number.isSafeInteger(revision)||Number(revision)<0)throw Error('invalid_publication');
  const result=await pool.query(`UPDATE automod_control SET publication_owner=$2,publication_revision=$3,
    desired_enabled=CASE WHEN $2='manual' THEN FALSE ELSE desired_enabled END
    WHERE streamer_id=$1 AND (publication_revision IS NULL OR publication_revision<$3
      OR (publication_revision=$3 AND publication_owner=$2)) RETURNING publication_owner,publication_revision`,[streamerId,owner,revision]);
  if(!result.rowCount)throw Error('publication_revision_conflict');
  return {ok:true,...result.rows[0]};
}
