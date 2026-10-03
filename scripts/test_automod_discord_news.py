import unittest
from automod_discord_news import plan, next_event, payload


def hunt(count=0, phase='capturing', condition='count', start=50000, balance=50000):
    return {'phase': 'running', 'publisherActive': True, 'mode': 'bonus-hunt',
            'bonusHunt': {'cycleId': 'cycle-1', 'phase': phase, 'startBalanceCents': start, 'balanceCents': balance},
            'config': {'stakeCents': 10, 'fastSpins': True, 'enhancedSpins': {'hacksaw': {'enabled': True}},
                       'bonusHunt': {'openingCondition': condition, 'targetBonuses': 20, 'balanceFloorCents': 0}},
            'huntEntries': [{'status': 'opened'}] * 30 + [{'status': 'pending'}] * count}


class NewsTests(unittest.TestCase):
    def test_start_and_persistent_dedup(self):
        p = plan(hunt())
        self.assertEqual(next_event(p, {})[0], 'start')
        self.assertIsNone(next_event(p, {'start': {'messageId': 'saved-before-restart'}}))

    def test_old_cycles_not_counted_and_exact_thresholds(self):
        self.assertEqual(plan(hunt(9))['count'], 9)
        self.assertEqual(plan(hunt(9))['events'], [])
        self.assertEqual(next_event(plan(hunt(10)), {'start': {}})[0], 'half')
        self.assertEqual(next_event(plan(hunt(18)), {'start': {}, 'half': {}})[0], 'near')
        self.assertIn('2 bonus', next_event(plan(hunt(18)), {'start': {}, 'half': {}})[2])

    def test_skipped_thresholds_emit_one_latest_message(self):
        event = next_event(plan(hunt(18)), {'start': {}})
        self.assertEqual(event[0], 'near')
        self.assertEqual(event[3], ['half'])

    def test_paused_or_unpublished_never_alerts(self):
        for changed in [{'phase': 'error'}, {'publisherActive': False}]:
            self.assertIsNone(plan(hunt() | changed))

    def test_balance_half_and_imminent_use_actual_start_budget(self):
        self.assertEqual(plan(hunt(condition='balance', balance=25000))['events'][0][0], 'half')
        self.assertEqual(plan(hunt(condition='balance', balance=5000))['events'][-1][0], 'near')

    def test_opening_and_new_cycle(self):
        p = plan(hunt(20, phase='opening'))
        self.assertEqual(next_event(p, {'start': {}, 'half': {}, 'near': {}})[0], 'opening')
        newer = hunt()
        newer['bonusHunt']['cycleId'] = 'cycle-2'
        self.assertNotEqual(plan(newer)['key'], p['key'])

    def test_role_ping_is_explicit_and_no_everyone(self):
        c = {'roleId': '123', 'apiBase': 'https://lunalive-api.onrender.com', 'liveUrl': 'https://rumble.com/user/LeCasiNoze/live', 'lunaUrl': 'https://lunalive.win/s/lecasinoze'}
        p = plan(hunt())
        m = payload(c, p, next_event(p, {}))
        self.assertEqual(m['allowed_mentions'], {'parse': [], 'roles': ['123']})
        self.assertEqual(m['content'], '<@&123>')
        self.assertIn('20 bonus', m['embeds'][0]['title'])
        self.assertEqual(len(m['components'][0]['components']), 2)


if __name__ == '__main__':
    unittest.main()
