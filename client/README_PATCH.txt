RA2 jitter fix v2:
1) issueMoveAll now assigns infantry a destination subSlot per tile and targets that subslot.
2) followPath final snap prefers order.subSlot when present.
Apply: overwrite client/js/game.js and (optional) client/index.html.
