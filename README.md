# minimal-additional-mod-actions
Fork of [Samuel Liew's Minimal Additional Post Mod Actions](https://github.com/samliew/SO-mod-userscripts) user script to quickly nuke spammers from the post page.

This userscript appends a menu next to the post — either question or answer — with three actions: destroy user as spammer, destroy user as troll, delete user. This allows to nuke evil accounts immediately from the post page instead of clicking through the moderator UI. 

This fork also includes a fix: apparently Stack Exchange changed the post page HTML not long ago, preventing this script from correctly parsing of the user id from the page markup. Without the user id, the menu couldn't be properly initialized. 
