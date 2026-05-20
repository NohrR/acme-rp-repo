Original palette snapshot before the neutral redesign on 2026-05-18:

- Public interior pages used orange-first canvases, primarily `#ff8434`.
- The services landing page used `#ff7937` and `#ff8434` as dominant backgrounds.
- The homepage had already been reverted to a white background with orange prompt accents.
- Public pages commonly paired orange backgrounds with white text, white outlines, and the white logo asset `acmelogowhite.png`.
- Main 3D accents in [main-scene.js](/D:/NOHR/DIGITAL%20CREATIONS/ACME%20Website/Demo%20Site%201/main-scene.js) used white wireframes and a warm orange-tinted fill light.
- The About page 3D logo material in [about.html](/D:/NOHR/DIGITAL%20CREATIONS/ACME%20Website/Demo%20Site%201/about.html) was forced to white.

Files updated for the neutral redesign:

- [neutral-theme-overrides.css](/D:/NOHR/DIGITAL%20CREATIONS/ACME%20Website/Demo%20Site%201/neutral-theme-overrides.css)
- [index.html](/D:/NOHR/DIGITAL%20CREATIONS/ACME%20Website/Demo%20Site%201/index.html)
- [main.html](/D:/NOHR/DIGITAL%20CREATIONS/ACME%20Website/Demo%20Site%201/main.html)
- [about.html](/D:/NOHR/DIGITAL%20CREATIONS/ACME%20Website/Demo%20Site%201/about.html)
- [contact.html](/D:/NOHR/DIGITAL%20CREATIONS/ACME%20Website/Demo%20Site%201/contact.html)
- [news.html](/D:/NOHR/DIGITAL%20CREATIONS/ACME%20Website/Demo%20Site%201/news.html)
- [services.html](/D:/NOHR/DIGITAL%20CREATIONS/ACME%20Website/Demo%20Site%201/services.html)
- [services-detailed.html](/D:/NOHR/DIGITAL%20CREATIONS/ACME%20Website/Demo%20Site%201/services-detailed.html)
- [cms-login.html](/D:/NOHR/DIGITAL%20CREATIONS/ACME%20Website/Demo%20Site%201/cms-login.html)
- [cms-admin.html](/D:/NOHR/DIGITAL%20CREATIONS/ACME%20Website/Demo%20Site%201/cms-admin.html)
- [main-scene.js](/D:/NOHR/DIGITAL%20CREATIONS/ACME%20Website/Demo%20Site%201/main-scene.js)

Neutral palette introduced:

- Background: `#ffffff`
- Soft background: `#f6f4ef`
- Surface: `#fbfaf7`
- Text: `#1f2933`
- Muted text: `#5b6670`
- Accent brand orange: `#e8742f`
- Accent hover: `#cf6425`

To revert:

- Remove the `neutral-theme-overrides.css` links from the HTML files above.
- Restore `acmelogowhite.png` where `acme.png` replaced it on light pages.
- Restore the white material colors in `main-scene.js` and the About page 3D logo block if the orange-first theme is desired again.
