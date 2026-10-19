import contextlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
import publication_mode_sync as sync


class PublicationSyncTests(unittest.TestCase):
    def fixture(self, directory, error=False):
        client=Mock()
        if error: client.api.side_effect=RuntimeError('offline')
        else: client.api.return_value={'ok':True,'publication_owner':'manual','publication_revision':'23'}
        loader=Mock()
        spec=Mock(loader=loader)
        module=Mock();module.LunaLive.return_value=client
        stack=contextlib.ExitStack();self.addCleanup(stack.close)
        stack.enter_context(patch.object(sync,'ACK',Path(directory)/'ack.json'))
        stack.enter_context(patch.object(sync,'_lock'))
        stack.enter_context(patch.object(sync,'read_owner',return_value={'owner':'manual','revision':23}))
        stack.enter_context(patch.object(sync.importlib.util,'spec_from_file_location',return_value=spec))
        stack.enter_context(patch.object(sync.importlib.util,'module_from_spec',return_value=module))
        return client

    def test_unchanged_owner_never_polls_api(self):
        with tempfile.TemporaryDirectory() as directory:
            client=self.fixture(directory)
            self.assertTrue(sync.sync_once())
            self.assertFalse(sync.sync_once())
            client.api.assert_called_once_with('control/publication','POST',{'owner':'manual','revision':23})

    def test_network_failure_is_not_recorded_as_synced(self):
        with tempfile.TemporaryDirectory() as directory:
            self.fixture(directory,error=True)
            with self.assertRaises(RuntimeError):sync.sync_once()
            self.assertFalse(sync.ACK.exists())

    def test_wrong_revision_ack_cannot_disable_future_retries(self):
        with tempfile.TemporaryDirectory() as directory:
            client=self.fixture(directory)
            client.api.return_value={'publication_owner':'manual','publication_revision':22}
            with self.assertRaises(RuntimeError):sync.sync_once()
            self.assertFalse(sync.ACK.exists())


if __name__=='__main__':unittest.main()
