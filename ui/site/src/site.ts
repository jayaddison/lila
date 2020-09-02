import exportLichessGlobals from "./site.lichess.globals"
import StrongSocket from "./component/socket";
import { unload, redirect, reload } from "./component/reload";
import announce from './component/announce';
import moduleLaunchers from "./component/module-launchers";
import pubsub from "./component/pubsub";
import miniBoard from "./component/mini-board";
import miniGame from "./component/mini-game";
import { requestIdleCallback } from "./component/functions";
import powertip from "./component/powertip";
import timeago from "./component/timeago";
import topBar from "./component/top-bar";
import userAutocomplete from "./component/user-autocomplete";
import loadInfiniteScroll from "./component/infinite-scroll";
import { storage } from "./component/storage";
import { assetUrl } from "./component/assets";
import serviceWorker from "./component/service-worker";
import loadFriendsWidget from "./component/friends-widget";
import loadWatchersWidget from "./component/watchers-widget";
import loadClockWidget from "./component/clock-widget";

window.lichess = {
  ...window.lichess,
  ...exportLichessGlobals()
};

StrongSocket.defaults.events = {
  redirect(o) {
    setTimeout(() => {
      unload.expected = true;
      redirect(o);
    }, 200);
  },
  tournamentReminder(data) {
    if ($('#announce').length || $('body').data("tournament-id") == data.id) return;
    const url = '/tournament/' + data.id;
    $('body').append(
      '<div id="announce">' +
      '<a data-icon="g" class="text" href="' + url + '">' + data.name + '</a>' +
      '<div class="actions">' +
      '<a class="withdraw text" href="' + url + '/withdraw" data-icon="Z">Pause</a>' +
      '<a class="text" href="' + url + '" data-icon="G">Resume</a>' +
      '</div></div>'
    ).find('#announce .withdraw').click(function(this: HTMLElement) {
      $.post($(this).attr("href"));
      $('#announce').remove();
      return false;
    });
  },
  announce
};

$(() => {

  moduleLaunchers();

  loadWatchersWidget();
  loadClockWidget();

  pubsub.on('socket.in.fen', e =>
    document.querySelectorAll('.mini-game-' + e.id).forEach((el: HTMLElement) => miniGame.update(el, e))
  );
  pubsub.on('socket.in.finish', e =>
    document.querySelectorAll('.mini-game-' + e.id).forEach((el: HTMLElement) => miniGame.finish(el, e.win))
  );

  requestIdleCallback(() => {

    loadFriendsWidget();
    $('#friend_box').friends();

    $('#main-wrap')
      .on('click', '.autoselect', function(this: HTMLElement) {
        $(this).select();
      })
      .on('click', 'button.copy', function(this: HTMLElement) {
        $('#' + $(this).data('rel')).select();
        document.execCommand('copy');
        $(this).attr('data-icon', 'E');
      });

    $('body').on('click', 'a.relation-button', function(this: HTMLElement) {
      const $a = $(this).addClass('processing').css('opacity', 0.3);
      $.ajax({
        url: $a.attr('href'),
        type: 'post',
        success(html) {
          if (html.includes('relation-actions')) $a.parent().replaceWith(html);
          else $a.replaceWith(html);
        }
      });
      return false;
    });

    $('.mselect .button').on('click', function(this: HTMLElement) {
      const $p = $(this).parent();
      $p.toggleClass('shown');
      requestIdleCallback(() => {
        const handler = (e: Event) => {
          if ($p[0].contains(e.target as HTMLElement)) return;
          $p.removeClass('shown');
          $('html').off('click', handler);
        };
        $('html').on('click', handler);
      });
    });

    powertip.watchMouse();

    timeago.updateRegularly(1000);
    pubsub.on('content_loaded', timeago.findAndRender);

    if (!window.customWS) setTimeout(() => {
      if (!window.lichess.socket)
        window.lichess.socket = StrongSocket("/socket/v5", false);
    }, 300);

    topBar();

    window.addEventListener('resize', () => document.body.dispatchEvent(new Event('chessground.resize')));

    $('.user-autocomplete').each(function(this: HTMLElement) {
      const opts = {
        focus: 1,
        friend: $(this).data('friend'),
        tag: $(this).data('tag')
      };
      if ($(this).attr('autofocus')) userAutocomplete($(this), opts);
      else $(this).one('focus', function(this: HTMLElement) {
        userAutocomplete($(this), opts);
      });
    });

    loadInfiniteScroll('.infinitescroll');

    $('a.delete, input.delete').click(() => confirm('Delete?'));
    $('input.confirm, button.confirm').click(function(this: HTMLElement) {
      return confirm($(this).attr('title') || 'Confirm this action?');
    });

    $('#main-wrap').on('click', 'a.bookmark', function(this: HTMLElement) {
      const t = $(this).toggleClass('bookmarked');
      $.post(t.attr('href'));
      const count = (parseInt(t.text(), 10) || 0) + (t.hasClass('bookmarked') ? 1 : -1);
      t.find('span').html('' + (count > 0 ? count : ''));
      return false;
    });

    // still bind esc even in form fields
    window.Mousetrap.prototype.stopCallback = function(_, el, combo) {
      return combo != 'esc' && (
        el.isContentEditable || el.tagName == 'INPUT' || el.tagName == 'SELECT' || el.tagName == 'TEXTAREA'
      );
    };
    window.Mousetrap.bind('esc', function() {
      const $oc = $('#modal-wrap .close');
      if ($oc.length) $oc.trigger('click');
      else {
        const $input = $(':focus');
        if ($input.length) $input.trigger('blur');
      }
      return false;
    });

    if (!storage.get('grid')) setTimeout(() => {
      if (getComputedStyle(document.body).getPropertyValue('--grid'))
        storage.set('grid', 1);
      else
        $.get(assetUrl('oops/browser.html'), html => $('body').prepend(html))
    }, 3000);

    /* A disgusting hack for a disgusting browser
     * Edge randomly fails to rasterize SVG on page load
     * A different SVG must be loaded so a new image can be rasterized */
    if (navigator.userAgent.includes('Edge/')) setTimeout(() => {
      const sprite = $('#piece-sprite');
      sprite.attr('href', sprite.attr('href').replace('.css', '.external.css'));
    }, 1000);

    // prevent zoom when keyboard shows on iOS
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
      const el = document.querySelector('meta[name=viewport]') as HTMLElement;
      el.setAttribute('content', el.getAttribute('content') + ',maximum-scale=1.0');
    }

    miniBoard.initAll();
    miniGame.initAll();
    pubsub.on('content_loaded', miniBoard.initAll);
    pubsub.on('content_loaded', miniGame.initAll);

    $('.chat__members').watchers();

    if (location.hash === '#blind' && !$('body').hasClass('blind-mode'))
      $.post('/toggle-blind-mode', {
        enable: 1,
        redirect: '/'
      }, reload);

    serviceWorker();
  });
});