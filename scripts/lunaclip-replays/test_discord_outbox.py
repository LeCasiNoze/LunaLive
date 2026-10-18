import json,unittest
from unittest.mock import patch,Mock
import replays
from youtube_delivery import announcement_metadata,CHANNEL

class AnnouncementTests(unittest.TestCase):
 def video(self,**changes):
  row={'id':'123456789Ab','snippet':{'channelId':CHANNEL,'title':'Un vrai titre','publishedAt':'2026-10-18T15:00:00Z','thumbnails':{'high':{'url':'https://i.ytimg.com/vi/123456789Ab/hqdefault.jpg'}}},'contentDetails':{'duration':'PT3M1S'},'status':{'privacyStatus':'public'}}
  row.update(changes);return row
 def test_official_duration_and_image(self):
  event=announcement_metadata(self.video());self.assertEqual(event['durationSeconds'],181);self.assertTrue(event['thumbnail'].endswith('hqdefault.jpg'));self.assertEqual(event['publishedAt'],'2026-10-18T15:00:00Z')
 def test_unknown_duration_or_cover_never_invented(self):
  event=announcement_metadata(self.video(contentDetails={},snippet={}));self.assertIsNone(event['durationSeconds']);self.assertIsNone(event['thumbnail']);self.assertIsNone(event['publishedAt'])
 def state(self):return {'phase':'published','youtube':{'privacy':'public','processingStatus':'succeeded','announcement':announcement_metadata(self.video())}}
 def test_private_and_processing_never_notified(self):
  with patch.object(replays.subprocess,'run') as send:
   state=self.state();state['youtube']['privacy']='private';replays.notify_discord(state)
   state=self.state();state['youtube']['processingStatus']='processing';replays.notify_discord(state);send.assert_not_called()
 def test_notification_failure_never_restarts_upload(self):
  state=self.state()
  with patch.object(replays.subprocess,'run',side_effect=TimeoutError):replays.notify_discord(state)
  self.assertEqual(state['phase'],'published');self.assertEqual(state['discordNotificationError'],'outbox_unavailable');self.assertNotIn('discordOutboxRecorded',state)
 def test_notification_resume_and_record(self):
  state=self.state()
  with patch.object(replays.subprocess,'run',return_value=Mock(returncode=0,stdout=json.dumps({'ok':True,'inserted':True}).encode())) as send:
   replays.notify_discord(state);replays.notify_discord(state);self.assertEqual(send.call_count,1);self.assertEqual(state['phase'],'published')
 def test_iso_duration_parsed_without_rounding_at_boundary(self):
  for value,seconds in [('PT3M',180),('PT3M1S',181),('PT2H1M30S',7290)]:self.assertEqual(announcement_metadata(self.video(contentDetails={'duration':value}))['durationSeconds'],seconds)

if __name__=='__main__':unittest.main()
