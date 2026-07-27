import json
tpl=open('template_full.html',encoding='utf-8').read()
css=open('frag_css.txt',encoding='utf-8').read()
toolbar=open('frag_toolbar.txt',encoding='utf-8').read()
report=open('frag_report.txt',encoding='utf-8').read()
agg=open('browser_agg.js',encoding='utf-8').read()
parse=open('browser_parse.js',encoding='utf-8').read()
feats=open('features.js',encoding='utf-8').read()
parsed=open('/tmp/parsed_new.json',encoding='utf-8').read().strip()

# 1) CSS before </style>
assert tpl.count('</style>')==1
tpl=tpl.replace('</style>', css+'\n</style>',1)

# 2) toolbar right after <body>
assert tpl.count('<body>')==1
tpl=tpl.replace('<body>','<body>\n'+toolbar,1)

# 3) header count id
assert tpl.count('<span class="tag">13 medições · Abr/25 a Abr/26</span>')==1
tpl=tpl.replace('<span class="tag">13 medições · Abr/25 a Abr/26</span>','<span class="tag" id="hdrCount">13 medições · Abr/25 a Abr/26</span>',1)

# 4) report before <footer>
assert tpl.count('<footer>')==1
tpl=tpl.replace('<footer>', report+'\n<footer>',1)

# 5) replace DATA init
old='const DATA = __DATA_JSON__;'
assert tpl.count(old)==1
newinit=("const ORIGINAL_HTML = '<!DOCTYPE html>\\n' + document.documentElement.outerHTML;\n"
         + "/* ---- agregação (porta de build_dataset.py) ---- */\n" + agg + "\n"
         + "const PARSED = /*__PARSED"+"_START__*/" + parsed + "/*__PARSED"+"_END__*/;\n"
         + "const DATA = buildDataset(PARSED);\n")
tpl=tpl.replace(old,newinit,1)

# 6) parser + features before </script> (last one)
addend="\n/* ---- leitura de PDF no navegador (porta de extract.py) ---- */\n"+parse+"\n/* ---- funcionalidades: relatório, upload, cópia ---- */\n"+feats+"\n"
idx=tpl.rfind('</script>')
tpl=tpl[:idx]+addend+tpl[idx:]

# footer dynamic count text tweak (leave note generic)
tpl=tpl.replace('das 13 medições da pasta','das medições da pasta')

open('/tmp/final_dashboard.html','w',encoding='utf-8').write(tpl)
print('final bytes:',len(tpl))
print('has PARSED marker:', tpl.count('/*__PARSED'+'_START__*/'))
print('has buildDataset:', 'function buildDataset' in tpl)
print('has parsePdf:', 'async function parsePdf' in tpl)
print('placeholder left __DATA_JSON__:', tpl.count('__DATA_JSON__'))
