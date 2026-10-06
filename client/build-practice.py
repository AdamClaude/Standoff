# Inline the practice build into one self-contained page for publishing.
import glob, re, sys
d = 'dist-offline/assets/'
js = open(glob.glob(d + '*.js')[0]).read().replace('</script', '<\\/script')
css = open(glob.glob(d + '*.css')[0]).read().replace('</style', '<\\/style')
fonts = 'https://fonts.googleapis.com/css2?family=Limelight&family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&family=Reem+Kufi:wght@500;700&family=Cairo:wght@400;600;700&display=swap'
page = f'''<title>Standoff</title>
<meta name="theme-color" content="#16131a">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}">
<style>:root{{color-scheme:dark;background:#16131a}} html,body{{height:100%;background:#16131a}}</style>
<style>{css}</style>
<div id="root"></div>
<script type="module">{js}</script>
'''
out = sys.argv[1]
open(out, 'w').write(page)
print(out, len(page))
