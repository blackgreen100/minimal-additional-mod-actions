// ==UserScript==
// @name         Fork of Minimal Additional Post Mod Actions
// @description  Adds a menu with mod-only quick actions in post sidebar
// @homepage     https://github.com/blackgreen100/minimal-additional-mod-actions
// @author       Samuel Liew (first version), blackgreen (fork)
// @version      6.1.0
//
// @match        https://*.stackoverflow.com/*
//
// @exclude      https://api.stackexchange.com/*
// @exclude      https://data.stackexchange.com/*
// @exclude      https://contests.stackoverflow.com/*
// @exclude      https://winterbash*.stackexchange.com/*
// @exclude      *chat.*
// @exclude      *blog.*
// @exclude      */tour
//
// @require      https://raw.githubusercontent.com/samliew/SO-mod-userscripts/master/lib/se-ajax-common.js
// @require      https://raw.githubusercontent.com/samliew/SO-mod-userscripts/master/lib/common.js
// @require      https://unpkg.com/sweetalert/dist/sweetalert.min.js
// ==/UserScript==

/* eslint-disable no-multi-spaces */
/* global swal:readonly          */
/* global $:readonly             */
/* global StackExchange:readonly */
/* global fkey:readonly          */
/* global isSO:readonly          */
/* global isSOMeta:readonly      */
/* global isMetaSite:readonly    */
/* global selfId:readonly        */
/// <reference types="./globals" />

// LAST UPDATED 07-02-2024

'use strict';

// This is a moderator-only userscript
if (!isModerator()) return;

// Yes, you can declare the variable apikey here and have it picked up by the functions in se-ajax-common.js
const apikey = 'lSrVEbQTXrJ4eb4c3NEMXQ((';
const newlines = '\n\n';

// Add your user ID here (or set the corresponding value in your Local Storage) to promote yourself
// to a "superuser", which enables rarely-used options and decreases the number of confirmations.
const superusers = [584192, 366904, 6451573, 4108803];
const isSuperuser = superusers.includes(selfId) ||
    ((localStorage.getItem('SOMU-aipmm.isSuperuser') ?? 'false') === 'true');

// This option defaults to "false". Manually set it to "true" (or set the corresponding value
// in your Local Storage) to allow destroying spam accounts as fast as possible
// without multiple confirmations.
const underSpamAttackMode = (localStorage.getItem('SOMU-aipmm.underSpamAttackMode') ?? 'false') === 'true';

/*
 * Reload functions
 */
const reloadPage = () => {
    // If in mod queues, do not reload
    if (isModDashboardPage) return false;
    location.reload();
};

async function promptToNukePostAndUser(pid, isQuestion, isDeleted, uid, uName, spammer, usercardHtml = null) {
    if (typeof uid === 'undefined' || uid === null) { throw new Error('null or undefined uid'); }

    const postType = spammer ? 'spam' : 'trolling/abusive';
    const userType = spammer ? 'spammer' : 'troll';
    const nukePost = pid && !isDeleted;
    const userInfo = (await Promise.allSettled([getUserInfoFromApi(uid)]))[0].value;

    // Display the confirmation and options dialog.
    let swalContentHtml = `<div class="group"><div class="info">`; // begin first info group
    if (usercardHtml) {
        swalContentHtml += usercardHtml;
    }
    if (userInfo) {
        // To counteract information overload, only display what is not already displayed in the user-card
        // (which is always visible on the page on the associated post, and also added inline to this dialog,
        // if possible). Therefore, reputation and badge information is not included in this text.
        // The user account name and ID are still displayed for double-checking purposes and for linkability
        // (since clicking on links in the user-card under the post would dismiss the modal dialog).
        const creationDate = seApiDateToDate(userInfo?.creation_date);
        const modifiedDate = seApiDateToDate(userInfo?.last_modified_date);
        const accessDate = seApiDateToDate(userInfo?.last_access_date);
        const hasOtherPosts = isQuestion ? (Number(userInfo?.question_count) > 1 || Number(userInfo?.answer_count) > 0)
            : (Number(userInfo?.question_count) > 0 || Number(userInfo?.answer_count) > 1);

        swalContentHtml += `
      The <i>${userInfo.user_type}</i> user,
      &quot;<a href="${userInfo.link}"><strong>${uName}</strong></a>&quot;
      (ID&nbsp;<code>${uid}</code>${userInfo?.account_id ? `; <a href="https://stackexchange.com/users/${userInfo.account_id}?tab=accounts">network&nbsp;account</a>&nbsp;ID&nbsp;<code>${userInfo.account_id}</code>` : ''}),
      was
      <strong>created&nbsp;<span title="${dateToIsoString(creationDate).replaceAll(' ', '&nbsp;')}">${dateToRelativeTime(creationDate).replaceAll(' ', '&nbsp;')}</span></strong>${modifiedDate ? `, last&nbsp;<strong>modified&nbsp;<span title="${dateToIsoString(modifiedDate).replaceAll(' ', '&nbsp;')}">${dateToRelativeTime(modifiedDate).replaceAll(' ', '&nbsp;')}</span></strong>,` : ''}
      and <strong>last&nbsp;seen&nbsp;<span title="${dateToIsoString(accessDate).replaceAll(' ', '&nbsp;')}">${dateToRelativeTime(accessDate).replaceAll(' ', '&nbsp;')}</span></strong>.
      They have
      <a href="${userInfo.link}?tab=questions&sort=newest"><strong>${userInfo.question_count}</strong>&nbsp;non&#8209;deleted&nbsp;question${userInfo.question_count !== 1 ? 's' : ''}</a>
      and
      <a href="${userInfo.link}?tab=answers&sort=newest"><strong>${userInfo.answer_count}</strong>&nbsp;non&#8209;deleted&nbsp;answer${userInfo.answer_count !== 1 ? 's' : ''}</a>.`;

        if (hasOtherPosts > 0) {
            swalContentHtml += `<div class="s-notice s-notice__warning" role="status">User has other non-deleted posts: be sure to check these before destroying the account!</div>`;
        }
    }

    // end first info group and begin next group
    swalContentHtml += `
    </div></div>
    <div class="group">
      <div class="header">Optional Overrides:</div>`;

    swalContentHtml += `
    <div class="option">
      <input type="checkbox" name="aipmm-bowdlerize-toggle" id="aipmm-bowdlerize-toggle" />
      <label for="aipmm-bowdlerize-toggle" title="Enabling this option will clear all fields in the user's profile to remove spam content and reset the display name.&#13;(If the account is removed on this site, the original info is still retrieved and recorded in the deleted user record.)">
        Bowdlerize profile and push edits to all sites
      </label>
    </div>`;

    if (spammer) {
        swalContentHtml += `
      <div class="option">
        <input type="checkbox" name="aipmm-noaudit-toggle" id="aipmm-noaudit-toggle" ${nukePost ? '' : 'disabled'}/>
        <label for="aipmm-noaudit-toggle" title="Enabling this option will nuke the post as &quot;rude/abusive&quot;, thus preventing it from being automatically selected as an audit.&#13;Otherwise, if this option is not enabled, the post will be nuked as &quot;spam&quot, thus allowing it to be selected as an audit.">
          Prevent post from becoming a spam audit
        </label>
      </div>`;
    }

    swalContentHtml += `
    <div class="option">
      <input type="checkbox" name="aipmm-suspendonly-toggle" id="aipmm-suspendonly-toggle" />
      <label for="aipmm-suspendonly-toggle" title="Enabling this option will prevent the account from being destroyed. Instead, it will automatically send a message that suspends the user for the maximum duration that is permitted for moderators (365 days).&#13;This is intended to be used in situations where you'd prefer to keep the account around (e.g., for follow-up investigations or because staff has requested it).">
        Skip destroying user&mdash;only suspend for maximum duration of 1 year
      </label>
    </div>`;

    // end second group
    swalContentHtml += `</div>`;

    // final group
    swalContentHtml += `
    <div class="group">
      <div class="header">Destroy Details:</div>
      <textarea autocapitalize="sentences"
        autocomplete="on"
        autocorrect="on"
        placeholder="Optional context and details for why you are destroying the account. (This will be included with the deleted user profile.)"
      ></textarea>
    </div>`;

    const swalContent = document.createElement('div');
    swalContent.innerHTML = swalContentHtml;
    // TODO: Add option to report to Smokey before nuking, with checkbox and nested textbox, a la SIM.
    //       (For spammer, default message to 'reported by site moderator as spam';
    //        for troll, default message to 'reported by site moderator for training'.)
    swalContent.querySelector('#aipmm-suspendonly-toggle').addEventListener('click', (event) => {
        const suspendOnly = event.target.checked;
        const modal = event.target.closest('.swal-modal');
        if (modal) {
            const textarea = modal.querySelector('textarea');
            if (textarea) {
                textarea.disabled = suspendOnly;
            }

            const submitBtn = modal.querySelector('.swal-button--confirm.swal-button--danger');
            if (submitBtn) {
                let label = submitBtn.textContent;
                if (suspendOnly) label = label.replace('Destroy', 'Suspend');
                else label = label.replace('Suspend', 'Destroy');
                submitBtn.textContent = label;
            }
        }
    });
    let needsRefresh = false;
    const skipAllDialogs = selfId === 584192;
    try {
        const confirmed = skipAllDialogs || await swal({
            title: `Nuke ${nukePost ? `this post as ${postType} and ` : ''} the user "${uName}" as a ${userType}?`,
            buttons:
                {
                    confirm:
                        {
                            text: `Destroy "${uName}" as ${userType}`,
                            value: true,
                            visible: true,
                            closeModal: false,
                            className: 's-btn s-btn__filled s-btn__danger',
                        },
                    cancel:
                        {
                            text: 'Cancel',
                            value: null,
                            visible: true,
                            closeModal: true,
                            className: 's-btn s-btn__muted',
                        }
                },
            dangerMode: true,
            closeOnEsc: true,
            closeOnClickOutside: true,
            backdrop: false,
            content: swalContent,
        });
        if (skipAllDialogs || confirmed) {
            const bowdlerize = skipAllDialogs ? false : document.querySelector('#aipmm-bowdlerize-toggle').checked;
            const rudeFlag = skipAllDialogs ? false : !spammer || document.querySelector('#aipmm-noaudit-toggle').checked;
            const suspendOnly = skipAllDialogs ? false : document.querySelector('#aipmm-suspendonly-toggle').checked;
            const details = skipAllDialogs ? '' : document.querySelector('.swal-content textarea').value.trim();
            if ((spammer && underSpamAttackMode) ||
                isSuperuser ||
                confirm(`Are you certain that you want to${nukePost ? ' nuke this post and ' : ' '}${suspendOnly ? 'SUSPEND' : 'DESTROY'} the account "${uName}" as a ${userType}?`)) {
                // TODO: If post has already been flag-nuked as spam, but "rudeFlag" is set, change it.
                //       (This requires undeleting the post, unlocking it, and then re-flagging it.
                //       But, more importantly, it requires determining how the post has been flagged.)
                //       For now, if the post has already been deleted, just don't do anything.
                //       (The option to raise a rude flag instead will have been disabled.)
                if (nukePost) {
                    await flagPost(pid, rudeFlag);
                    needsRefresh = true;
                }

                // If we are to suspend the user, then do so first. This ensures that their *current*
                // name appears in the mod message, not what it gets reset to after bowdlerization.
                // Note that we no longer send a suspension before destroying the account. This is because:
                // (1) a recent system change makes it obsolete (accounts destroyed for the reason we use
                // are blocked for 365 days, instead of 14 days), and (2) doing so without the workaround
                // to prevent the message from showing up in the global mod inbox (padding the message name
                // out with spaces to make it extremely long), which is virtually necessary to keep the
                // mod inbox usable on Stack Overflow, generates exceptions, causing staff to request that
                // we stop using it. Sending the suspension first does marginally improve the UX for users
                // who recreate the account (which is stupidly easy to do), in that the reason why their
                // old account was destroyed appears in their inbox (although they cannot actually view it,
                // only see the preview), but (1) it is not all that important to improve the UX for users
                // whose account has been destroyed, (2) this is not a big enough improvement to justify
                // irritating staff/devs, and (3) if this is actually desirable (which it probably is), it
                // should simply be implemented at the system level when any account that has been destroyed
                // or deleted for the reasons that automatically suspend upon re-creation is re-created.
                if (suspendOnly) {
                    await modMessageUser(uid,
                        'Account disabled for spamming and/or abusive behavior. You\'re no longer welcome to participate here.',
                        false,  // do not email (show message on-site only)
                        365,    // suspend for 365 days (maximum duration)
                        `suspend ${userType}`,
                        spammer ? 'for promotional content' : 'for rule violations');
                    needsRefresh = true;
                }

                // Before bowdlerizing, which will reset some of the PII fields, retrieve the current PII
                // so that it can be recorded in the deletion record (this info is inaccessible or perhaps
                // removed entirely for deleted/destroyed accounts, so this step is critical to preserve
                // the information for later investigations, if necessary). Of course, we don't want to
                // retrieve PII unnecessary, not only for information-privacy reasons, but also for speed
                // and rate-limiting concerns. Therefore, we only retrieve the PII if we are actually
                // going to destroy the account (i.e., if we are not only suspending).
                const pii = !suspendOnly ? await getUserPii(uid) : null;
                if (bowdlerize) {
                    await resetUserProfile(uid);
                    needsRefresh = true;
                }

                // If we are to destroy the user, then do so now, after everything else has been done.
                // Pass in the user information and PII that we cached in order for it to be recorded.
                if (!suspendOnly) {
                    await destroyUser(uid,
                        details,
                        'This user was created to post spam or nonsense and has no other positive participation',
                        userInfo,
                        pii);
                    needsRefresh = true;
                }

                // If the account was bowdlerized and/or destroyed, show the user profile page
                // in a new pop-up window. (Exception: don't do it when destroying a spammer's
                // account when the site is under a spam attack, or ever for superusers.)
                if ((bowdlerize || !suspendOnly) && (!underSpamAttackMode || !spammer) && !isSuperuser) {
                    window.open(`${location.origin}/users/${uid}`,
                        '_blank',
                        'popup=true');
                }
            }
        }
    }
    catch (e) {
        console.error(e);
        alert('An error occurred; please see the console for details on exactly what failed.');
        needsRefresh = false;  // unconditionally prevent refresh to avoid clearing the console
    }

    // Try closing swal dialog
    try {
        swal.stopLoading();
        swal.close();
    }
    catch (e) { }

    return needsRefresh;
};


/*
 * UI functions
 */
function addPostModMenuLinks() {
    let isStagingGround = false
    const f = function() {
        const post = $(this).closest('.question, .answer');
        // const postStatusEl = post.find('.js-post-notice, .special-status, .question-status');
        // const postStatus = postStatusEl.text().toLowerCase();
        const isQuestion = post.hasClass('question');
        // const isClosed = postStatusEl.find('b').text().toLowerCase().includes('closed') || postStatus.includes('on hold') || postStatus.includes('duplicate') || postStatus.includes('already has');
        // const isDeleted = post.hasClass('deleted-answer');
        // const isOldDupe = isQuestion && post.find('.js-post-body blockquote').first().find('strong').text().includes('Possible Duplicate');
        const pid = post.attr('data-questionid') || post.attr('data-answerid');
        const userdetails = isStagingGround ? post.find('.user-info:last .user-details') :  post.find('.post-layout .user-info:last .user-details');
        const userlink = userdetails.find('a').first();
        const uid = getUserId(userlink.attr('href'));
        const userRep = userdetails.find('.reputation-score').text();
        const username = userdetails.find('.user-details a').first().text();
        const userAttributes = { uid, username };
        const useractiontime = post.find('.post-layout .user-info:last .user-action-time');
        const postDate = useractiontime.find('.relativetime').attr('title');
        const postAge = (Date.now() - new Date(postDate)) / 86400000;
        const postType = isQuestion ? 'question' : 'answer';
        const allowDestroyUser = (postAge < 60 || isSuperuser) && Number(userRep) < 500;

        // .js-post-menu is also found on the post revisions page, but we don't want to touch that
        if (typeof pid === 'undefined') return;


        function makeItem(action, text, title = '', enabled = true, style = '', dataAttribs = '') {
            // Convert data attributes object to string
            if (typeof dataAttribs === 'object' && dataAttribs !== null) {
                dataAttribs = Object.entries(dataAttribs).map(([key, value]) => `data-${camelToKebab(key)}="${value}"`).join(' ');
            }
            return `<button type="button" class="s-btn ${style}" data-action="${action}" ${dataAttribs} title="${title}" ${enabled ? '' : 'disabled'}>${text}</button>`;
        }

        const items = {
            // Add user-related links only if there is a post author, and is not a Meta site
            'userSpammer': !isMetaSite && uid && makeItem('nuke-spammer', 'nuke spammer..', `prompt for options and confirmation to nuke this ${postType} and the user as a spammer (promotional content)`, allowDestroyUser, 'danger', userAttributes),
            'userTroll': !isMetaSite && uid && makeItem('nuke-troll', 'nuke troll..', `prompt for options and confirmation to nuke this ${postType} and the user as a troll/abusive`, allowDestroyUser, 'danger', userAttributes),
            'userNoLongerWelcome': !isMetaSite && uid && makeItem('no-longer-welcome', 'user no longer welcome..', `prompt for confirmation to delete the user as &quot;no longer welcome&quot;`, true, 'danger', userAttributes),
        };

        // Add menu items to menu
        let menuitems = '';
        for (const item in items) {
            const val = items[item];
            if (val) menuitems += val;
        }

        $(this).append(`
      <div class="js-post-issue flex--item s-btn s-btn__unset ta-center py8 js-post-mod-menu-link" data-shortcut="O" title="Other mod actions">
        <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 512" class="svg-icon mln1 mr0"><path fill="currentColor"
          d="M64 208c26.5 0 48 21.5 48 48s-21.5 48-48 48-48-21.5-48-48 21.5-48 48-48zM16 104c0 26.5 21.5 48 48 48s48-21.5 48-48-21.5-48-48-48-48 21.5-48 48zm0 304c0 26.5 21.5 48 48 48s48-21.5 48-48-21.5-48-48-48-48 21.5-48 48z"></path>
        </svg>
        <div class="js-post-mod-menu" title="" data-pid="${pid}" role="dialog">
        ${menuitems}
        </div>
      </div>`);
    }

    if(window.location.pathname.includes('staging-ground')) {
        isStagingGround = true
        $('.question').find('.js-meta-info').not('.js-post-mod-menu-init').addClass('js-post-mod-menu-init').each(f);
    } else {
        // Append link to post sidebar if it doesn't exist yet
        $('.question, .answer').find('.js-voting-container').not('.js-post-mod-menu-init').addClass('js-post-mod-menu-init').each(f);
    }
}

function initPostModMenuLinks() {
    // Handle clicks on links in the mod quicklinks menu.
    // NOTE: We have to include the tag "main" for mobile web because it doesn't contain the wrapping elem "#content".
    $('#content, main').on('click', '.js-post-mod-menu button[data-action]', async function () {
        if (this.disabled) return; // should not need this because s-btn[disabled] already has pointer-events: none

        // Get question link if in mod queue
        const qlink = $(this).closest('.js-flagged-post').find('.js-body-loader a').first().attr('href');
        const reviewlink = $('.question-hyperlink').attr('href');

        const menuEl = this.parentNode;
        const pid = Number(menuEl.dataset.postId || menuEl.dataset.pid);
        const qid = Number($('#question').attr('data-questionid') || getPostId(qlink) || getPostId(reviewlink)) || null;
        const uid = Number(this.dataset.uid);
        const uName = this.dataset.username;
        //console.log(pid, qid);
        if (isNaN(pid) || isNaN(qid)) return;

        const post = $(this).closest('.answer, .question');
        const isQuestion = post.hasClass('question');
        const isDeleted = post.hasClass('deleted-answer');
        const postType = isQuestion ? 'question' : 'answer';
        const action = this.dataset.action;
        //console.log(action);

        const removePostFromModQueue = pid => {
            if (isModDashboardPage) {
                post.parents('.js-flagged-post').remove();
                return true;
            }
            return false;
        };
        const removePostFromModQueueOrReloadPage = pid => {
            removePostFromModQueue() || reloadPage();
        };

        switch (action) {
            case 'nuke-spammer':
            case 'nuke-troll':
                promptToNukePostAndUser(
                    pid,
                    isQuestion,
                    isDeleted,
                    uid,
                    uName,
                    action === 'nuke-spammer',
                    post.find('.post-signature:last .user-info')[0]?.outerHTML
                ).then(function (result) {
                    if (result) {
                        removePostFromModQueueOrReloadPage();
                    }
                });
                break;
            case 'no-longer-welcome':
                if (confirm(`Are you sure you want to DELETE THE USER "${uName}" as "no longer welcome"?\n\n(Note that this post will not be affected, unless it is negatively-scored, in which case it will be implicitly deleted along with the user account.)`)) {
                    deleteUser(
                        uid,
                        '', // no details needed
                        'This user is no longer welcome to participate on the site'
                    ).then(function () {
                        removePostFromModQueueOrReloadPage();
                    });
                }
                break;
        }

        return;
    });
}

function addPostCommentsModLinks() {
    $('div[id^="comments-link-"]').addClass('js-comments-menu');

    // Append link to post sidebar if it doesn't exist yet
    const allCommentMenus = $('.js-comments-menu');

    // Init those that are not processed yet
    allCommentMenus.not('.js-comments-menu-init').addClass('js-comments-menu-init').each(function () {
        const post = $(this).closest('.answer, .question');
        const pid = Number(post.attr('data-answerid') || post.attr('data-questionid')) || null;
        this.dataset.postId = pid;

        // If there are deleted comments, move from sidebar to bottom
        const delCommentsBtn = post.find('.js-fetch-deleted-comments');
        if (delCommentsBtn.length === 1) {
            const numDeletedComments = (delCommentsBtn.attr('title') || delCommentsBtn.attr('aria-label')).match(/\d+/)[0];
            $(this).append(`
        <span class="js-link-separator2">&nbsp;|&nbsp;</span>
        <a class="s-link__danger js-show-deleted-comments-link" role="button"
            title="Expand to show all comments on this post, including deleted"
            href="${delCommentsBtn.attr('href')}">
          Show <b>${numDeletedComments}</b> deleted comment${numDeletedComments > 1 ? 's' : ''}
        </a>`);
            delCommentsBtn.hide();
        }

        // Add move to chat and purge links
        $(this).children('.mod-action-links').remove(); // in case added by another US
        $(this).append(`
      <div class="mod-action-links dno" style="float:right; padding-right:10px">
        <a data-post-id="${pid}" class="s-link__danger js-move-comments-link" title="Move all comments to chat, then delete all comments">move to chat</a>
        <span class="js-link-separator3">&nbsp;|&nbsp;</span>
        <a data-post-id="${pid}" class="s-link__danger js-purge-comments-link" title="Delete all comments">purge all</a>
      </div>`);
    });

}

// Append styles
addStylesheet(`
/* Better post menu links */
.js-post-menu {
  margin-top: 7px !important;
}
.js-post-menu .s-anchors > .flex--item {
  margin-top: 0 !important;
}
.js-post-menu .s-anchors > div.flex--item {
  margin-left:  0;  /* Move margins from container to item... */
  margin-right: 0;  /* ...to allow hiding individual items.   */
}
.js-post-menu .s-anchors > div.flex--item button,
.js-post-menu .s-anchors > div.flex--item a {
  text-transform: lowercase;
  font-size: 0.97em;
  margin-left:  calc(var(--su8) / 2);
  margin-right: calc(var(--su8) / 2);
}
.js-post-menu .s-anchors.s-anchors__muted .s-btn.s-btn__link,
.js-post-menu .s-anchors.s-anchors__muted a:not(.s-link) {
  color: var(--black-500);
}
.js-post-menu .s-anchors.s-anchors__muted .s-btn.s-btn__link:hover,
.js-post-menu .s-anchors.s-anchors__muted a:not(.s-link):hover {
  color: var(--black-300);
}

.post-signature {
  min-width: 180px;
  width: auto;       /* allow the usercard to shrink, if possible...          */
  max-width: 200px;  /* ...but never allow to expand larger than default size */
}


/* Overflow each post in mod dashboard so the menu can be visible */
.js-loaded-body,
.js-loaded-body.overflow-x-auto {
  overflow: initial !important;
}

/* Mod menu link in sidebar */
.js-post-mod-menu-link {
  position: relative;
  display: inline-block;
  margin-top: 8px;
  padding: 8px;
  color: inherit;
  cursor: pointer;
}
.js-post-mod-menu-link svg {
  max-width: 19px;
  max-height: 18px;
  width: 19px;
  height: 18px;
}
.js-post-mod-menu-link svg:hover {
  cursor: pointer;
  color: hsl(210,77%,36%);
}
.js-post-mod-menu-link:hover .js-post-mod-menu,
.js-post-mod-menu-link .js-post-mod-menu:hover {
  display: flex;
}

/* Mod menu popup */
.js-post-mod-menu-link .js-post-mod-menu {
  --menu-padding-left: 24px;
  --menu-padding-right: 36px;

  display: none;
  flex-wrap: wrap;
  position: absolute;
  top: 0;
  left: 0;
  padding: 0 0 6px;
  z-index: 3;
  cursor: auto;

  background: var(--white);
  border-radius: 2px;
  border: 1px solid transparent;
  box-shadow: 0 8px 10px 1px rgba(0,0,0,0.14), 0 3px 14px 2px rgba(0,0,0,0.12), 0 5px 5px -3px rgba(0,0,0,0.2);

  text-align: left;
  white-space: nowrap;
}
.js-post-mod-menu-link * {
  font-family: inherit;
  font-size: inherit;
  letter-spacing: inherit;
}
.js-post-mod-menu .js-post-mod-menu-header {
  display: block !important;
  width: 100%;
  margin-bottom: 5px;
  padding: 8px 0;
  padding-left: var(--menu-padding-left);
  padding-right: var(--menu-padding-right);
  background-color: var(--yellow-050);
  border-bottom: 1px solid var(--yellow-100);
  color: var(--black);
  font-weight: bold;
}
.js-post-mod-menu > button {
  display: block;
  min-width: 120px;
  width: 100%;
  padding: 5px 0;
  padding-left: var(--menu-padding-left);
  padding-right: var(--menu-padding-right);
  cursor: pointer;
  color: var(--black-500);
  text-align: left;
  user-select: none;
}
.js-post-mod-menu .inline-label {
  margin-top: -0.5rem;
  margin-bottom: 0rem;
  padding-left: 2px;
  font-size: 0.85rem;
  pointer-events: none;
  z-index: 1;
}
.js-post-mod-menu > button:hover {
  background-color: var(--black-100);
}
.js-post-mod-menu > button.disabled {
  background-color: var(--black-050) !important;
  color: var(--black-200) !important;
  cursor: not-allowed;
}
.js-post-mod-menu > button.danger:hover {
  background-color: var(--red-500);
  color: var(--white);
}
.js-post-mod-menu .js-post-mod-menu-header + .separator {
  display: none;
}
.js-post-mod-menu .separator {
  display: block;
  width: 100%;
  margin: 5px 0;
  border-top: 1px solid var(--black-100);
  pointer-events: none;
}

@media screen and (max-width: 500px) {
  header.-summary {
    overflow: initial;
  }
  .js-post-mod-menu-link svg {
    max-width: 17px;
    max-height: 16px;
    color: var(--black-500);
  }
}


/* Comments form and links */
.js-comment-form-layout > div:nth-child(2),
.js-comments-menu {
  display: block !important;
}
.js-comment-form-layout > div:nth-child(2) br {
  display: none;
}
.js-edit-comment-cancel {
  display: block;
  margin-bottom: 5px;
}
a.js-load-deleted-nomination-comments-link,
a.js-show-deleted-comments-link,
a.js-move-comments-link,
a.js-purge-comments-link {
  color: var(--red-600);  /* slightly darken "danger" color (.bg-danger) */
}
a.js-show-deleted-comments-link,
a.js-move-comments-link,
a.js-purge-comments-link {
  padding: 0 3px 2px 3px;
  text-decoration: none;
}
.comment-help {
  max-width: none;
}


/* Pop-up dialog for destroy user */
.swal-overlay {
  background-color: hsl(358deg 67% 6% / 50%); /* Stacks' --_mo-bg */
  /*background: 0; */
}
.swal-overlay,
.swal-overlay--show-modal .swal-modal {
  transition: ease-in-out 0.1s;
  animation: 0;
}
.swal-modal,
.swal-overlay--show-modal .swal-modal {
  padding: 18px;
  border-radius: 0;
  will-change: unset;
}
.swal-modal {
  width: 700px;
  background-color: var(--white);
  border: solid 1px var(--black-300);
  box-shadow: var(--bs-sm);
}
body.theme-dark .swal-modal,
.theme-dark__forced .swal-modal,
body.theme-system .theme-dark__forced .swal-modal {
  background-color: var(--black-100);
}
@media only screen and (max-width: 750px) {
  .swal-modal {
    width: 495px;
  }
}
.swal-content {
  margin: 0;
  padding: 0;
  color: inherit;
  font-size: var(--fs-body2);
  width: 100%
}
.swal-title:first-child,
.swal-title:not(:last-child) {
  margin: -3px 0 18px 0;
  padding: 0;
  text-align: left;
  font-size: var(--fs-title);
  font-weight: 400;
  color: var(--red-600); /* Stacks' --_mo-header-fc */
}
.swal-content .group {
  display: block;
  margin: 18px 0;
  text-align: left;
}
.swal-content .header {
  font-weight: bold;
}
.swal-content .info {
  margin: 18px 0;
  font-size: var(--fs-body2);
}
.swal-content code {
  padding: 0;
  background-color: inherit;
}
.swal-content .user-info {
  float: right;
  margin-left: 18px;
  font-size: 90%;
  background-color: var(--theme-secondary-050);  /* ALTERNATIVE: var(--highlight-bg); */
  border: 1px solid var(--br-md);                /* ALTERNATIVE: var(--bc-light);     */
}
.swal-content .s-notice {
  clear: both;
  float: left;
  width: 100%;
  margin: 9px 0 18px;
  padding: 9px;
}
.swal-content .option {
  margin: 6px 18px;
}
.swal-content .option input,
.swal-content .option input + label {
  cursor: pointer;
}
.swal-content .option input:disabled,
.swal-content .option input:disabled + label {
  cursor: not-allowed;
}
.swal-content .option input:disabled + label {
  opacity: 0.5;
}
.swal-content textarea {
  width: 100%;
  height: 80px;
  margin: 4px 0 0 0;
  font: inherit;
  font-weight: normal;
}
.swal-footer {
  margin: 0;
  padding: 0;
}
.swal-button-container {
  float: left;
  margin: 0 5px 0 0;
}
.swal-button__loader {
  width: 100%;
  padding: 9px 0;
  background-color: var(--red-500);  /* Stacks' .bg-danger */
}


/* Hide question summary in mod dashboard if in spam mode */
body.js-spam-mode .post-layout.expandable-question-summary {
  display: none !important;
}
body.js-spam-mode .visited-post {
  opacity: 1 !important;
}

/* Sidebar has too high of a z-index */
#left-sidebar {
  z-index: 1;
}
`); // end stylesheet


// On script run
(function init() {
    // If spam mode is switched on
    if (underSpamAttackMode) {
        document.body.classList.add('js-spam-mode'); // CSS styling purposes only

        // If filtered to spamoffensive flags in mod dashboard, expand all flagged posts
        if (location.search.includes('flags=spamoffensive')) {
            setTimeout(function () {
                $('.js-expand-body:visible').trigger('click');
            }, 1000); // short wait for dashboard scripts to init
        }
    }

    // Once on page load
    initPostModMenuLinks();
    addPostModMenuLinks();

    // After requests have completed
    $(document).ajaxStop(function () {
        addPostModMenuLinks();
    });

})();
