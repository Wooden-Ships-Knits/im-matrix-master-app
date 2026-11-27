/**
 * PDM — Feature Checklist, as a Google Sheet.
 *
 * HOW TO RUN IT
 *   1. Open the sheet:
 *      docs.google.com/spreadsheets/d/14nGCueDTUQ6zSL7paNVj9Mz6JZdML2uhBtTAPGEY_ZU
 *   2. Extensions ▸ Apps Script. Delete whatever is in the editor.
 *   3. Paste this whole file in, then Save.
 *   4. Press Run, with buildChecklist chosen in the function box. Google asks
 *      for permission the first time — it is your own script editing your own
 *      spreadsheet, so Allow.
 *   5. Go back to the sheet tab. Two sheets are there: Checklist and Progress.
 *
 * Running it again rebuilds both sheets from scratch, so anything typed into
 * PIC or Status is lost. Build it once, then work in the sheet.
 *
 * WHAT THE TEAM FILLS IN
 *   PIC     — free text, whoever owns that feature
 *   Status  — a dropdown: Done, or Not yet
 *
 * The Features cell goes GREY when Status is Done and stays YELLOW until
 * then. The Progress sheet counts each app's rows with COUNTIFS, so adding
 * a row updates it on its own.
 */

var APPS = [
  ['Matrix Master', [
    'Pick a season and a collection; the sheet is built one collection at a time',
    'Attributes view — every matrix column edited in the grid, saved per cell',
    'Layout view — the cards in the order the printed sheet will show them',
    'Drag a card to reorder; the order is saved on the style, so everyone sees it',
    'TBD tray — park a style with no position yet, drop it in when it is decided',
    'Add a new style straight into the open collection',
    'Import a style from another season into this collection',
    'Drag a photo onto a card to attach it to the style',
    'Checklist step chips on each card, showing how far that style has got',
    'Repeat colouring — a style that also ran in another season is marked',
    'Highlight pens and colourway marks, applied by hand and kept',
    'Search within the collection',
    'Delete a style, with a confirm step',
    'Print — the same card on screen is the one that comes out of the printer',
  ]],
  ['Price Matrix', [
    'Shares the season and collection picker with Matrix Master',
    'One column per style, twelve to a block, in the F27 MATRIX PRICING layout',
    'Rows: FAF / FAH, Line price, Retail price, 000 price, NO X/L note',
    'Prices typed on the card, saved as you go',
    'Prints in the same layout as the workbook',
    'Hidden from the menu for now — opens at /matrix?sheet=pricing',
  ]],
  ['IM Master', [
    'Browse and search every style; filter by season, size or colour',
    'Open a style — one screen, one Save, no wizard',
    'Matrix section — the point-of-measure grid, points down and sizes across',
    'BOM section — yarn lines per colourway, with percent, ends and component',
    'Yarn section — the yarn list behind the BOM',
    'Operations section — minutes per operation, season standard or overridden',
    'Pricing section — wholesale, retail and the SY / 000 variants',
    'Packaging section — packing method, units per carton, carton size',
    'Shipping section — carton weights, cube and notes',
    'Colourways — add, duplicate, mark as substituted by another',
    'SKU code built from category, season and the rest',
    'Sold through SY / 000 and the channel, derived rather than typed twice',
    'Name history — every rename recorded, so the style stays findable',
    'Past seasons — the same garment across the seasons it ran in',
    'Style jump — go straight to another style without going back to Browse',
    'Unsaved-changes warning before leaving the editor',
    "Costing calculated from the season's rates, never stored in a column",
  ]],
  ['Sales Historical Matrix', [
    'Look a garment up and see every season it ran in',
    'Search covers every name a product has been known by, so a rename does not split it',
    'Fetch a window of sales from Salesforce and Shopify into the database',
    'Which periods have already been loaded, per season',
    'Unmatched rows — what matched no style or colourway, biggest first',
    'Reports carry the filters, not a frozen copy, so they show the data as it is now',
    'Report flow: draft, submitted, then approved or sent back',
    'Report kinds: style list, pricing, costing, packaging, salesforce upload',
  ]],
  ['Color Table', [
    'Every yarn colour with its kilos read from YARN ANALYSIS',
    'Stock, on PO, and the four AV figures, to one decimal',
    'Says which file the figures came from, when it was read, and which batch',
    "Group the board by palette, by O4 status, or by a season's palette",
    'Drag a swatch between palettes (palette view only)',
    'To-check queue — rows the importer would not guess: unreadable, unknown code, code clash',
    'Answering a question teaches the importer, so the same spelling is never asked twice',
    'Cover a shortage — record kilos of one colour covering another, with candidates suggested',
    'Propose a yarn swap per colourway, checked against the colourways that use it',
    'Open changes list with AV now and AV after, and a withdraw',
    'Closed changes kept as history',
    'CSV export of the changes (NOTE PERUBAHAN)',
    'CSAT — Color Sequence Adjustment Table, a shared page for laying colours side by side',
    'Monthly import: read, stage, load — re-reading the same file changes nothing',
  ]],
  // The IM to Salesforce project — "upload to Salesforce" is what it does,
  // IM to Salesforce is what it is called.
  ['IM to Salesforce', [
    'Planned — nothing built yet; it exists only as a report kind today',
    'Planned — choose the season and the styles to send',
    'Planned — map our fields to the Salesforce ones, and keep the mapping',
    'Planned — send, and record what was sent and when',
    'Planned — show what was rejected, and let it be sent again',
  ]],
];

var GREEN = '#2f6b5c';
var GREY = '#d9d9d9';
var YELLOW = '#fff2a8';
var HEAD = 4;                 // the header row; data starts at HEAD + 1
var SPARE = 200;              // rows past the last feature that still get the
                              // dropdown and the colours, for rows added later

function buildChecklist() {
  var ss = SpreadsheetApp.getActive();
  var sh = reset_(ss, 'Checklist', 0);

  sh.getRange('A1').setValue('PDM — Feature Checklist')
    .setFontFamily('Arial').setFontSize(14).setFontWeight('bold');

  sh.getRange('A2:D2').merge().setValue(
      'Fill in PIC and Status only. Status is a dropdown: pick "Done" when the '
      + 'feature has been checked and accepted — the Features cell turns grey. '
      + 'Anything else stays yellow. Example row: App "Matrix Master", '
      + 'PIC "Rina", Status "Done". Add rows at the bottom of an app\'s block '
      + 'and the Progress sheet counts them automatically.')
    .setFontFamily('Arial').setFontSize(9).setFontStyle('italic')
    .setFontColor('#55605a').setWrap(true).setVerticalAlignment('top');
  sh.setRowHeight(2, 46);

  sh.getRange(HEAD, 1, 1, 4).setValues([['App', 'PIC', 'Features', 'Status']])
    .setFontFamily('Arial').setFontWeight('bold').setFontColor('#ffffff')
    .setBackground(GREEN).setVerticalAlignment('middle');
  sh.setRowHeight(HEAD, 22);

  // One flat block of rows, so it is a single setValues call rather than 64.
  var rows = [];
  var starts = [];                      // first row of each app, for the rule
  APPS.forEach(function (pair) {
    starts.push(HEAD + 1 + rows.length);
    pair[1].forEach(function (feature) {
      rows.push([pair[0], '', feature, 'Not yet']);
    });
  });
  var last = HEAD + rows.length;
  sh.getRange(HEAD + 1, 1, rows.length, 4).setValues(rows)
    .setFontFamily('Arial').setFontSize(10).setVerticalAlignment('top');
  sh.getRange(HEAD + 1, 3, rows.length, 1).setWrap(true);

  sh.setColumnWidth(1, 170);
  sh.setColumnWidth(2, 110);
  sh.setColumnWidth(3, 560);
  sh.setColumnWidth(4, 90);
  sh.setFrozenRows(HEAD);

  // The dropdown, and the colours, run past the last feature so a row typed
  // underneath behaves like the rest without anyone editing the rules.
  var deep = rows.length + SPARE;
  sh.getRange(HEAD + 1, 4, deep, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['Done', 'Not yet'], true)
      .setAllowInvalid(false)
      .setHelpText('Done, or Not yet')
      .build());

  // Grey when done, yellow until then. Sheets takes the FIRST rule that
  // matches, so Done has to be the one on top.
  var paint = sh.getRange(HEAD + 1, 3, deep, 1);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($C' + (HEAD + 1) + '<>"",$D' + (HEAD + 1) + '="Done")')
      .setBackground(GREY).setFontColor('#6b6b6b').setRanges([paint]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($C' + (HEAD + 1) + '<>"",$D' + (HEAD + 1) + '<>"Done")')
      .setBackground(YELLOW).setRanges([paint]).build(),
  ]);

  // A line above each app's first row, so the blocks read apart.
  starts.forEach(function (r) {
    sh.getRange(r, 1, 1, 4).setBorder(true, null, null, null, null, null,
                                      GREEN, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  });

  sh.getRange(HEAD, 1, rows.length + 1, 4).createFilter();
  progress_(ss, last);
  ss.setActiveSheet(sh);
  SpreadsheetApp.getUi().alert(
    'Built ' + rows.length + ' features across ' + APPS.length + ' apps.');
}

/** The counts, read off the Checklist sheet rather than stored again. */
function progress_(ss, last) {
  var sh = reset_(ss, 'Progress', 1);
  sh.getRange('A1').setValue('Progress by app')
    .setFontFamily('Arial').setFontSize(14).setFontWeight('bold');
  sh.getRange('A2').setValue('Counted from the Checklist sheet — nothing to fill in here.')
    .setFontFamily('Arial').setFontSize(9).setFontStyle('italic').setFontColor('#55605a');

  sh.getRange(4, 1, 1, 5)
    .setValues([['App', 'Features', 'Done', 'Left', '% done']])
    .setFontFamily('Arial').setFontWeight('bold').setFontColor('#ffffff')
    .setBackground(GREEN);

  var rows = APPS.map(function (pair, i) {
    var r = 5 + i;
    return [
      pair[0],
      '=COUNTIFS(Checklist!$A:$A,$A' + r + ')',
      '=COUNTIFS(Checklist!$A:$A,$A' + r + ',Checklist!$D:$D,"Done")',
      '=B' + r + '-C' + r,
      '=IF(B' + r + '=0,0,C' + r + '/B' + r + ')',
    ];
  });
  var end = 4 + rows.length;
  rows.push(['All apps', '=SUM(B5:B' + end + ')', '=SUM(C5:C' + end + ')',
             '=B' + (end + 1) + '-C' + (end + 1),
             '=IF(B' + (end + 1) + '=0,0,C' + (end + 1) + '/B' + (end + 1) + ')']);

  sh.getRange(5, 1, rows.length, 5).setValues(rows).setFontFamily('Arial').setFontSize(10);
  sh.getRange(5, 5, rows.length, 1).setNumberFormat('0%');
  sh.getRange(end + 1, 1, 1, 5).setFontWeight('bold')
    .setBorder(true, null, null, null, null, null, GREEN,
               SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  [170, 90, 70, 70, 80].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(4);
}

/** A named sheet, empty, in the right position. */
function reset_(ss, name, index) {
  var sh = ss.getSheetByName(name);
  if (sh) {
    ss.deleteSheet(sh);
  }
  sh = ss.insertSheet(name, index);
  return sh;
}
