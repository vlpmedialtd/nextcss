import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compile.js';

const html = (src: string) => compile(src).html;
const errors = (src: string) => compile(src).diagnostics.filter((d) => d.level === 'error');
const warnings = (src: string) => compile(src).diagnostics.filter((d) => d.level === 'warning');

const TABS = 'tabs\n  tab "Monatlich"\n    text "29 €"\n  tab "Jährlich"\n    text "290 €"';

describe('tabs', () => {
  it('render as exclusive details, the first one open, without JavaScript', () => {
    expect(html(TABS)).toBe(
      '<div class=n-tabs>' +
        '<details class=n-tab name=tabs1 open><summary>Monatlich</summary><div><p class=n-text>29 €</p></div></details>' +
        '<details class=n-tab name=tabs1><summary>Jährlich</summary><div><p class=n-text>290 €</p></div></details>' +
        '</div>',
    );
    expect(html(TABS)).not.toContain('<script');
  });

  it('lay out as tabs where ::details-content exists, else stay an accordion', () => {
    const { css } = compile(TABS);
    expect(css).toContain('.n-tabs{display:flex;flex-direction:column}');
    expect(css).toContain('@supports selector(::details-content){.n-tabs{flex-flow:row wrap');
    expect(css).toContain('.n-tab{display:contents}');
    expect(css).toContain('.n-tab::details-content{order:1;flex-basis:100%}');
  });

  it('open picks the initial tab', () => {
    const out = html('tabs\n  tab "A"\n    text "a"\n  tab "B" open\n    text "b"');
    expect(out).toContain('<details class=n-tab name=tabs1><summary>A</summary>');
    expect(out).toContain('<details class=n-tab name=tabs1 open><summary>B</summary>');
    expect(warnings('tabs\n  tab "A" open\n    text "a"\n  tab "B" open\n    text "b"')[0].message).toMatch(/only one tab can be open/);
  });

  it('every group has its own name', () => {
    const out = html(`${TABS}\n${TABS}`);
    expect(out.match(/name=tabs1/g)).toHaveLength(2);
    expect(out.match(/name=tabs2/g)).toHaveLength(2);
  });

  it('labels are inline text; headings inside follow the surrounding level', () => {
    const out = html('section\n  title "Preise"\n  tabs\n    tab "**Neu**: Jahr"\n      card\n        title "Basic"');
    expect(out).toContain('<summary><strong>Neu</strong>: Jahr</summary>');
    expect(out).toMatch(/<h3[^>]*>Basic<\/h3>/);
    expect(compile('page "x"\ntitle "A"\nsection\n  title "Preise"\n  tabs\n    tab "x"\n      card\n        title "Basic"').diagnostics).toEqual([]);
  });

  it('checks the structure', () => {
    expect(errors('tab "x"')[0].message).toBe('tab belongs inside tabs');
    expect(errors('tabs\n  tab "A"\n    text "a"\n  text "x"')[0].message).toBe('"tabs" can only contain tab');
    expect(errors('tabs')[0].message).toBe('tabs needs tab lines: tab "Label"');
    expect(errors('tabs\n  tab\n    text "x"')[0].message).toMatch(/"tab" needs a text/);
  });

  it('plain pages get bare details', () => {
    const out = html('page plain\ntabs\n  tab "A"\n    text "a"');
    expect(out).toContain('<div><details name=tabs1 open><summary>A</summary><p>a</p></details></div>');
  });
});
