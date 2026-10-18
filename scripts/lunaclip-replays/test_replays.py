import json,tempfile,unittest
from pathlib import Path
from unittest.mock import Mock,patch
import replays
import youtube_delivery as uploader

class PolicyTests(unittest.TestCase):
    def row(self,**kwargs):
        return dict(slug='lecasinoze',title='Le retour du Noze - Hunt raw !site',ended_at='2026-10-18T11:00:00Z',started_at='2026-10-18T08:00:00Z',duration_sec=10800,video_id='v123',is_live=False,**kwargs)
    def test_personal_ended_over_hour(self):self.assertTrue(replays.eligible(self.row(),1792332000)[0])
    def test_automod_and_auto_hunt_excluded(self):
        for title in ('Automod — !call','Auto mode','Auto Hunt','auto-hunt','Session automatique',''):
            r=self.row();r['title']=title;self.assertFalse(replays.eligible(r,1792332000)[0],title)
    def test_one_hour_exactly_excluded(self):
        r=self.row();r['duration_sec']=3600;self.assertFalse(replays.eligible(r,1792332000)[0])
    def test_active_and_recent_archive_excluded(self):
        r=self.row();r.update(is_live=True,live_id='123');self.assertFalse(replays.eligible(r,1792332000)[0])
        r=self.row();self.assertFalse(replays.eligible(r,replays.epoch(r['ended_at'])+300)[0])
    def test_wrong_account_and_prior_upload_excluded(self):
        for changes in ({'slug':'fabiozsis'},{'yt_video_id':'already'}):
            r=self.row();r.update(changes);self.assertFalse(replays.eligible(r,1792332000)[0])
    def test_urls_allow_only_rumble_media(self):
        for url in ('https://evilrumble.com/x','http://rumble.com/x','https://user@rumble.com/x','https://127.0.0.1/x'):
            self.assertFalse(replays.allowed(url))
        self.assertTrue(replays.allowed('https://cdn.rumble.cloud/test'))
    def test_title_and_metadata_truthful(self):
        m=replays.metadata(self.row());self.assertNotIn('!site',m['title']);self.assertLessEqual(len(m['title']),100)
        self.assertIn('18+',m['description']);self.assertNotIn('publishAt',m)
    def test_reuse_exact_reviewed_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);p=root/'data/outputs/vod-4404-replay-v1.mp4';p.parent.mkdir(parents=True);p.write_bytes(b'approved')
            with patch.object(replays,'ROOT',root),patch.object(replays,'probe',return_value={'format':{'duration':'7290.09'}}),patch.object(replays,'resolve_archive') as resolve:
                source,proof=replays.prepare({'id':'4404'},root,{});self.assertEqual(source,p);self.assertTrue(proof['reviewedByUser']);resolve.assert_not_called()

class UploaderTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);root=Path(self.temp.name)
        self.source=root/'replay.mp4';self.source.write_bytes(b'test-replay');self.receipt=root/'receipt.json'
        self.req={'source':str(self.source),'credentials':'unused','receipt':str(self.receipt),'sourceTag':'lc-rediff-rumble-v123','kind':'vod','title':'Test','description':'Rediff','tags':[]}
        self.api=Mock();self.http=Mock();self.row={'id':'video1','snippet':{'channelId':uploader.CHANNEL},'status':{'privacyStatus':'public'},'processingDetails':{'processingStatus':'succeeded'}}
        self.api.videos().list().execute.side_effect=lambda:{'items':[self.row]}
        checked=patch.object(uploader,'checked_api',return_value=(self.api,self.http));checked.start();self.addCleanup(checked.stop)
        self.rec=patch.object(uploader,'reconcile',return_value=None);self.reconcile=self.rec.start();self.addCleanup(self.rec.stop)
    def response(self,status,value=None,headers=None):
        return Mock(status_code=status,json=lambda:value or {},headers=headers or {})
    def record(self,**kwargs):
        value={'sha256':uploader.digest(self.source),'size':self.source.stat().st_size,'sourceTag':self.req['sourceTag'],'phase':'uploading',**kwargs}
        self.receipt.write_text(json.dumps(value))
    def test_resume_lost_final_response_without_second_upload(self):
        self.record(uri='https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test')
        self.http.put.return_value=self.response(200,{'id':'video1'})
        result=uploader.deliver(self.req);self.assertEqual(result['state'],'published');self.http.post.assert_not_called();self.reconcile.assert_not_called()
    def test_new_public_vod_uses_notifications(self):
        self.http.post.return_value=self.response(200,headers={'Location':'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test'})
        self.http.put.return_value=self.response(200,{'id':'video1'})
        result=uploader.deliver(self.req);self.assertEqual(result['state'],'published')
        self.assertIn('notifySubscribers=true',self.http.post.call_args.args[0]);self.assertEqual(self.http.post.call_args.kwargs['json']['status']['privacyStatus'],'public')
    def test_uncertain_initialisation_never_blindly_restarts(self):
        self.record(phase='initializing')
        with self.assertRaisesRegex(ValueError,'upload_outcome_uncertain'):uploader.deliver(self.req)
        self.http.post.assert_not_called()
    def test_changed_source_blocks(self):
        self.record(sha256='wrong')
        with self.assertRaisesRegex(ValueError,'upload_source_changed'):uploader.deliver(self.req)
        self.http.post.assert_not_called()
    def test_private_forced_by_platform_is_not_claimed_public(self):
        self.record(videoId='video1');self.row['status']['privacyStatus']='private'
        self.assertEqual(uploader.deliver(self.req)['state'],'blocked')
    def test_known_init_rejection_can_retry_after_quota_reset(self):
        self.http.post.return_value=self.response(403)
        with self.assertRaisesRegex(ValueError,'youtube_init_http_403'):uploader.deliver(self.req)
        self.assertEqual(json.loads(self.receipt.read_text())['phase'],'new')
    def test_wrong_final_channel_blocks(self):
        self.record(videoId='video1');self.row['snippet']['channelId']='wrong'
        with self.assertRaisesRegex(ValueError,'uploaded_video_channel_mismatch'):uploader.deliver(self.req)
    def test_required_thumbnail_missing_blocks_before_video_upload(self):
        self.req['requireThumbnail']=True
        with self.assertRaisesRegex(ValueError,'thumbnail_required_before_upload'):uploader.deliver(self.req)
        self.http.post.assert_not_called()
    def test_thumbnail_retry_does_not_upload_the_video_again(self):
        self.record(videoId='video1');cover=Path(self.temp.name)/'thumbnail.jpg';cover.write_bytes(b'jpeg-fixture');self.req['thumbnail']=str(cover)
        with patch.object(uploader,'set_thumbnail',side_effect=ValueError('youtube_thumbnail_http_503')):
            with self.assertRaisesRegex(ValueError,'youtube_thumbnail_http_503'):uploader.deliver(self.req)
        self.assertEqual(json.loads(self.receipt.read_text())['videoId'],'video1');self.http.post.assert_not_called()
        with patch.object(uploader,'set_thumbnail',return_value={'sha256':uploader.digest(cover),'videoId':'video1'}) as setter:
            self.assertEqual(uploader.deliver(self.req)['state'],'published');uploader.deliver(self.req);self.assertEqual(setter.call_count,1)
        self.http.post.assert_not_called()
    def test_thumbnail_action_rejects_another_channel(self):
        self.row['snippet']['channelId']='someone_else'
        with self.assertRaisesRegex(ValueError,'thumbnail_video_channel_mismatch'):uploader.deliver({'credentials':'unused','action':'set_thumbnail','videoId':'video1','thumbnail':'unused'})

class PublishedInspectionTests(unittest.TestCase):
    def test_processing_is_rechecked_without_new_upload(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);data=root/'data/youtube-replays';data.mkdir(parents=True);(root/'data/outputs').mkdir()
            (data/'candidates.json').write_text(json.dumps([{'id':'4404'}]));folder=data/'4404';folder.mkdir()
            (folder/'state.json').write_text(json.dumps({'vodId':'4404','phase':'published','confirmedPublishedAt':replays.now(),
                'updatedAt':replays.now(),'youtube':{'videoId':'one','processingStatus':'processing'}}))
            result={'videos':[{'id':'one','processingStatus':'succeeded','statistics':{'viewCount':'1'},'status':{'privacyStatus':'public'}}]}
            with patch.object(replays,'ROOT',root),patch.object(replays,'DATA',data),patch.object(replays,'deliver',return_value=result) as call,patch.object(replays,'prepare') as prepare:
                replays.tick();self.assertEqual(call.call_args.args[0]['action'],'inspect');prepare.assert_not_called()
            updated=json.loads((folder/'state.json').read_text());self.assertEqual(updated['youtube']['processingStatus'],'succeeded');self.assertEqual(updated['phase'],'published')

if __name__=='__main__':unittest.main()
