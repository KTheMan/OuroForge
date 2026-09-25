# Fonts

Ouroboros typography uses the Iosevka family recorded by the pinned source:

- Iosevka Regular
- Iosevka Bold
- Iosevka Light
- Iosevka Medium
- Iosevka Semibold Regular
- Iosevka Term Regular
- Iosevka Term Bold

Install these fonts locally and make them available to the Figma desktop app
before importing typography. OuroForge performs a font preflight before it
mutates the managed collection. If a required face is unavailable, the import
stops with the missing face in the error instead of substituting a different
font.

Component facsimile labels use Inter only as scaffold annotations. Named
Ouroboros text styles use the Iosevka faces above and bind their size, line
height, and tracking to managed variables.
