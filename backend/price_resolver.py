"""Card price resolution for booster EV simulation."""


class PriceResolver:
  """Resolve direct, reprint, global-cheapest, and vendor-average prices."""

  def __init__(self, card_cache, price_cache, lowest_cache):
    self.card_cache = card_cache
    self.price_cache = price_cache
    self.lowest_cache = lowest_cache

  def resolve_card_price(self, uuid, requested_finish, target_vendor, use_reprints):
    card = self.card_cache.get(uuid)
    if not card or card['is_online']:
      return None, 'unpriced'
    if card['is_ignored']:
      return 0.0, 'ignored'

    finish_order = (
        ['foil', 'normal', 'etched']
        if requested_finish == 'foil'
        else ['normal', 'foil', 'etched']
    )
    target_vendor = target_vendor.lower()
    if target_vendor == 'all':
      target_vendor = 'all_cheapest'

    if not use_reprints:
      vendors_available = self.price_cache.get(uuid, {})
      if vendors_available:
        if target_vendor in vendors_available and requested_finish in vendors_available[target_vendor]:
          return vendors_available[target_vendor][requested_finish], 'exact'

        if target_vendor in vendors_available:
          for finish in finish_order:
            if finish in vendors_available[target_vendor]:
              return vendors_available[target_vendor][finish], 'finish_fallback'

        for alt_vendor, finishes in vendors_available.items():
          if alt_vendor != target_vendor and requested_finish in finishes:
            return finishes[requested_finish], 'vendor_fallback'

        for alt_vendor, finishes in vendors_available.items():
          if alt_vendor != target_vendor:
            for finish in finish_order:
              if finish in finishes:
                return finishes[finish], 'vendor_finish_fallback'

    if use_reprints:
      lowest_data = self.lowest_cache.get(card['name'])
      if lowest_data and lowest_data['sellers']:
        sellers = lowest_data['sellers']
        if target_vendor in sellers and requested_finish in sellers[target_vendor]:
          return sellers[target_vendor][requested_finish], 'reprint'

        if target_vendor in sellers:
          for finish in finish_order:
            if finish in sellers[target_vendor]:
              return sellers[target_vendor][finish], 'finish_fallback'

        for alt_vendor, finishes in sellers.items():
          if alt_vendor != target_vendor and requested_finish in finishes:
            return finishes[requested_finish], 'vendor_fallback'

        if lowest_data['min_all'] is not None:
          return lowest_data['min_all'], 'vendor_finish_fallback'

    return None, 'unpriced'

  def resolve_card_price_global(self, uuid, requested_finish, use_reprints):
    card = self.card_cache.get(uuid)
    if not card or card['is_online']:
      return None, 'unpriced'
    if card['is_ignored']:
      return 0.0, 'ignored'

    finish_order = (
        ['foil', 'normal', 'etched']
        if requested_finish == 'foil'
        else ['normal', 'foil', 'etched']
    )
    if not use_reprints:
      sources = self.price_cache.get(uuid, {}).values()
      exact = [finishes[requested_finish] for finishes in sources if requested_finish in finishes]
      if exact:
        return min(exact), 'exact'
      for finish in finish_order:
        values = [finishes[finish] for finishes in self.price_cache.get(uuid, {}).values() if finish in finishes]
        if values:
          return min(values), 'finish_fallback'

    if use_reprints:
      lowest_data = self.lowest_cache.get(card['name'])
      if lowest_data and lowest_data['sellers']:
        sellers = lowest_data['sellers']
        exact = [finishes[requested_finish] for finishes in sellers.values() if requested_finish in finishes]
        if exact:
          return min(exact), 'reprint'
        for finish in finish_order:
          values = [finishes[finish] for finishes in sellers.values() if finish in finishes]
          if values:
            return min(values), 'finish_fallback'
        if lowest_data['min_all'] is not None:
          return lowest_data['min_all'], 'vendor_fallback'

    return None, 'unpriced'

  def resolve_card_price_average(self, uuid, requested_finish, sellers, use_reprints):
    resolved = [
        self.resolve_card_price(uuid, requested_finish, seller, use_reprints)
        for seller in sellers
    ]
    prices = [float(price) for price, _ in resolved if price is not None]
    statuses = [status for price, status in resolved if price is not None]
    if not prices:
      return None, 'unpriced'
    return sum(prices) / len(prices), 'exact' if all(status == 'exact' for status in statuses) else 'vendor_fallback'
