# Occupied-tile fit and shared faction architecture

The construction yard previously occupied 5x5 tiles but left a visible empty
strip inside its selection boundary. The factory's side-wall entrance also
misread the supplied RA2 reference: its layout needed a long production hall
with an exit at the end, rather than a doorway moved around a box.

The yard keeps its existing 5x5 gameplay footprint. Its constant model scale is
now 1.98, and its longitudinal floor cassettes, perimeter walls and central roof
extend together to fill the occupied ground. The same constant scale applies to
the packed MCV and all transition poses; no animated scaling or endpoint swap
was introduced. The 0.8-second deployment and weighted joint motion remain.

The factory now uses a 4x3 footprint. A long barrel-vault production hall opens
toward world +X (screen-right/down), with a rear-side control tower, cooling
equipment, end shutter and ramp. Interior length and equipment positions leave
room for the larger packed MCV. The roof opens about its longitudinal hinges. The large MCV remains in the
factory depth pass until its rear clears the portal; all outside lane samples
must be clear before release.
The shutter retracts into a straight cassette beneath a fixed curved portal,
avoiding stray slats above the arch when open.

Both buildings use the shared `industrial_palette.py`: silver ceramic armor,
blue-graphite frames and recesses, with runtime faction-color panels. The yard
keeps its multi-part machinery silhouette; the factory reads as one long hall.
Factory gameplay dimensions derive from its runtime footprint contract, and
the imported asset verifies the same dimensions and roof axis.

Validation:

- Loaded mesh ground bounds cover 100.8% x 99.72% of the yard footprint (the
  slight width excess includes stabilizer feet), and 99.55% x 99.09% of the
  factory footprint. White selection boundaries were inspected in-game.
- 49 yard deployment poses and eight packed headings inspected; cached yard
  endpoint has zero pixel differences. Six settled yards share one cache entry.
- Chrome and Firefox: MCV production, deployment, repacking, immediate building
  production, health preservation, selling/destruction and enemy deployment.
- Factory tests: end-exit reservation, sequential production, blocked exit,
  harvester dispatch, cancellation, zero-balance prepaid production, primary
  factory switching, hatch opening and reverse sale. Final shutter geometry was
  additionally verified in Chrome, including four MCV exit poses.
- Construction-completion work remains functional: routing, FIFO, cancellation
  and identical initial/final poses. The current roster has no aircraft; only
  the existing hatch launch hook is covered.

`architecture-report.json` summarizes the actual test outputs.
`architecture-in-game.png` retains the white occupied-tile outlines.
`mcv-full-footprint.gif` shows actual deployment and repacking at 0.8 seconds per
moving segment, with endpoint holds for inspection.
