"use strict";

/*
 * Teacher Tools Hub — Embedded Feedback Board
 * STEP 3A
 *
 * READ ONLY
 *
 * Browser
 *   → Supabase public RPC
 *
 * 허용:
 * - 게시글 목록 읽기
 * - 게시글 본문 읽기
 * - 댓글 읽기
 *
 * 금지:
 * - service_role
 * - write RPC
 * - 로그인
 * - 게시글/댓글 작성
 * - 수정/삭제
 * - OWNER moderation
 */

const FEEDBACK_CONFIG = Object.freeze({
  supabaseUrl:
    "https://rhtyktjebiunkchddxvg.supabase.co",

  publishableKey:
    "sb_publishable_SD1BpBEMqvj3Qv34ymUNFw_sqrgLwao",

  postPageSize: 10,
  commentPageSize: 30,
  requestTimeoutMs: 15000
});

const feedbackState = {
  posts: [],
  nextPostCursor: null,

  selectedPostId: "",

  comments: [],
  nextCommentCursor: null,

  postRequestSeq: 0,
  threadRequestSeq: 0,

  retryAction: null,
  busyPosts: false,
  busyThread: false
};

function feedbackEl(id) {
  return document.getElementById(id);
}

function feedbackSetHidden(element, hidden) {
  if (!element) return;
  element.hidden = Boolean(hidden);
}

function feedbackString(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
}

function feedbackDate(value, includeTime = false) {
  const raw = feedbackString(value).trim();

  if (!raw) {
    return "";
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  try {
    const options = includeTime
      ? {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        }
      : {
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        };

    return new Intl.DateTimeFormat(
      "ko-KR",
      options
    ).format(date);
  } catch (_error) {
    return date.toLocaleString();
  }
}

function feedbackCursorValue(
  cursor,
  key
) {
  if (
    !cursor ||
    typeof cursor !== "object"
  ) {
    return null;
  }

  const value = cursor[key];

  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  return value;
}

async function feedbackRpc(
  functionName,
  payload
) {
  const controller =
    new AbortController();

  const timeoutId = window.setTimeout(
    () => controller.abort(),
    FEEDBACK_CONFIG.requestTimeoutMs
  );

  try {
    const response = await fetch(
      `${FEEDBACK_CONFIG.supabaseUrl}/rest/v1/rpc/${encodeURIComponent(functionName)}`,
      {
        method: "POST",
        mode: "cors",
        cache: "no-store",
        signal: controller.signal,

        headers: {
          apikey:
            FEEDBACK_CONFIG.publishableKey,

          "Content-Type":
            "application/json",

          Accept:
            "application/json"
        },

        body: JSON.stringify(
          payload || {}
        )
      }
    );

    const raw =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `FEEDBACK_READ_${response.status}`
      );
    }

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (_error) {
      throw new Error(
        "FEEDBACK_RESPONSE_INVALID"
      );
    }
  } catch (error) {
    if (
      error &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "FEEDBACK_REQUEST_TIMEOUT"
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function feedbackShowGlobalError(
  message,
  retryAction
) {
  const host =
    feedbackEl(
      "feedback-global-error"
    );

  const text =
    feedbackEl(
      "feedback-global-error-text"
    );

  if (text) {
    text.textContent =
      message ||
      "게시판을 불러오지 못했습니다.";
  }

  feedbackState.retryAction =
    typeof retryAction === "function"
      ? retryAction
      : null;

  feedbackSetHidden(host, false);
}

function feedbackHideGlobalError() {
  feedbackSetHidden(
    feedbackEl(
      "feedback-global-error"
    ),
    true
  );

  feedbackState.retryAction = null;
}

function feedbackSetRefreshBusy(
  busy
) {
  const button =
    feedbackEl(
      "feedback-refresh-btn"
    );

  if (!button) return;

  button.disabled =
    Boolean(busy);

  button.textContent = busy
    ? "불러오는 중..."
    : "새로고침";
}

function feedbackPostPayload(
  cursor
) {
  return {
    p_limit:
      FEEDBACK_CONFIG.postPageSize,

    p_cursor_is_notice:
      feedbackCursorValue(
        cursor,
        "isNotice"
      ),

    p_cursor_created_at:
      feedbackCursorValue(
        cursor,
        "createdAt"
      ),

    p_cursor_post_id:
      feedbackCursorValue(
        cursor,
        "postId"
      )
  };
}

function feedbackThreadPayload(
  postId,
  cursor
) {
  return {
    p_post_id:
      feedbackString(postId),

    p_comment_limit:
      FEEDBACK_CONFIG.commentPageSize,

    p_cursor_created_at:
      feedbackCursorValue(
        cursor,
        "createdAt"
      ),

    p_cursor_comment_id:
      feedbackCursorValue(
        cursor,
        "commentId"
      )
  };
}

function feedbackNormalizePosts(
  items
) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter(item => {
    return (
      item &&
      typeof item === "object" &&
      feedbackString(
        item.postId
      ).trim()
    );
  });
}

function feedbackMergePosts(
  current,
  incoming
) {
  const result = [];
  const seen = new Set();

  [
    ...(Array.isArray(current)
      ? current
      : []),

    ...(Array.isArray(incoming)
      ? incoming
      : [])
  ].forEach(item => {
    const id =
      feedbackString(
        item && item.postId
      ).trim();

    if (!id || seen.has(id)) {
      return;
    }

    seen.add(id);
    result.push(item);
  });

  return result;
}

function feedbackCreatePostButton(
  item
) {
  const postId =
    feedbackString(
      item.postId
    ).trim();

  const button =
    document.createElement(
      "button"
    );

  button.type = "button";
  button.className =
    "feedback-list-item";

  button.dataset.postId =
    postId;

  if (
    postId ===
    feedbackState.selectedPostId
  ) {
    button.classList.add(
      "selected"
    );

    button.setAttribute(
      "aria-current",
      "true"
    );
  }

  const titleRow =
    document.createElement("div");

  titleRow.className =
    "feedback-list-title-row";

  if (item.isNotice === true) {
    const notice =
      document.createElement(
        "span"
      );

    notice.className =
      "feedback-notice-badge";

    notice.textContent =
      "공지";

    titleRow.append(notice);
  }

  const title =
    document.createElement(
      "strong"
    );

  title.textContent =
    feedbackString(
      item.title,
      "제목 없음"
    );

  titleRow.append(title);

  const meta =
    document.createElement(
      "div"
    );

  meta.className =
    "feedback-list-meta";

  const author =
    document.createElement(
      "span"
    );

  author.textContent =
    feedbackString(
      item.authorDisplayName,
      "사용자"
    );

  const date =
    document.createElement(
      "span"
    );

  date.textContent =
    feedbackDate(
      item.createdAt
    );

  meta.append(author, date);

  button.append(
    titleRow,
    meta
  );

  button.addEventListener(
    "click",
    () => {
      feedbackSelectPost(
        postId
      );
    }
  );

  return button;
}

function feedbackRenderPosts() {
  const list =
    feedbackEl(
      "feedback-list"
    );

  const loading =
    feedbackEl(
      "feedback-list-loading"
    );

  const empty =
    feedbackEl(
      "feedback-list-empty"
    );

  const error =
    feedbackEl(
      "feedback-list-error"
    );

  const more =
    feedbackEl(
      "feedback-more-btn"
    );

  if (!list) return;

  list.replaceChildren();

  feedbackState.posts.forEach(
    item => {
      list.append(
        feedbackCreatePostButton(
          item
        )
      );
    }
  );

  feedbackSetHidden(
    loading,
    true
  );

  feedbackSetHidden(
    error,
    true
  );

  const hasPosts =
    feedbackState.posts.length > 0;

  feedbackSetHidden(
    empty,
    hasPosts
  );

  feedbackSetHidden(
    list,
    !hasPosts
  );

  feedbackSetHidden(
    more,
    !(
      hasPosts &&
      feedbackState.nextPostCursor
    )
  );

  if (more) {
    more.disabled =
      feedbackState.busyPosts;
  }
}

function feedbackSetListError() {
  feedbackSetHidden(
    feedbackEl(
      "feedback-list-loading"
    ),
    true
  );

  feedbackSetHidden(
    feedbackEl(
      "feedback-list-empty"
    ),
    true
  );

  feedbackSetHidden(
    feedbackEl(
      "feedback-list"
    ),
    true
  );

  feedbackSetHidden(
    feedbackEl(
      "feedback-more-btn"
    ),
    true
  );

  feedbackSetHidden(
    feedbackEl(
      "feedback-list-error"
    ),
    false
  );
}

async function feedbackLoadPosts({
  append = false,
  autoSelect = false
} = {}) {
  if (
    feedbackState.busyPosts
  ) {
    return;
  }

  feedbackState.busyPosts = true;

  const requestSeq =
    ++feedbackState.postRequestSeq;

  const cursor =
    append
      ? feedbackState.nextPostCursor
      : null;

  const moreButton =
    feedbackEl(
      "feedback-more-btn"
    );

  if (append && moreButton) {
    moreButton.disabled = true;
    moreButton.textContent =
      "불러오는 중...";
  }

  if (!append) {
    feedbackSetHidden(
      feedbackEl(
        "feedback-list-loading"
      ),
      false
    );

    feedbackSetHidden(
      feedbackEl(
        "feedback-list-error"
      ),
      true
    );

    feedbackSetHidden(
      feedbackEl(
        "feedback-list-empty"
      ),
      true
    );

    feedbackSetHidden(
      feedbackEl(
        "feedback-list"
      ),
      true
    );

    feedbackSetHidden(
      moreButton,
      true
    );
  }

  try {
    const data =
      await feedbackRpc(
        "feedback_list_posts_v2",
        feedbackPostPayload(
          cursor
        )
      );

    if (
      requestSeq !==
      feedbackState.postRequestSeq
    ) {
      return;
    }

    const incoming =
      feedbackNormalizePosts(
        data &&
        data.items
      );

    if (append) {
      feedbackState.posts =
        feedbackMergePosts(
          feedbackState.posts,
          incoming
        );
    } else {
      feedbackState.posts =
        incoming;
    }

    feedbackState.nextPostCursor =
      data &&
      data.nextCursor &&
      typeof data.nextCursor ===
        "object"
        ? data.nextCursor
        : null;

    feedbackHideGlobalError();

    feedbackRenderPosts();

    if (
      autoSelect &&
      feedbackState.posts.length
    ) {
      const firstPostId =
        feedbackString(
          feedbackState
            .posts[0]
            .postId
        ).trim();

      await feedbackSelectPost(
        firstPostId,
        {
          force: true
        }
      );
    }
  } catch (error) {
    if (
      requestSeq !==
      feedbackState.postRequestSeq
    ) {
      return;
    }

    if (!append) {
      feedbackSetListError();
    }

    feedbackShowGlobalError(
      append
        ? "게시글을 더 불러오지 못했습니다."
        : "피드백 게시판을 불러오지 못했습니다.",

      () => {
        feedbackLoadPosts({
          append,
          autoSelect
        });
      }
    );

    try {
      console.error(
        "[Teacher Tools Feedback]",
        error
      );
    } catch (_error) {
      // Logging failure must not break UI.
    }
  } finally {
    if (
      requestSeq ===
      feedbackState.postRequestSeq
    ) {
      feedbackState.busyPosts =
        false;
    }

    if (moreButton) {
      moreButton.disabled =
        false;

      moreButton.textContent =
        "게시글 더 보기";
    }

    if (
      feedbackState.posts.length
    ) {
      feedbackRenderPosts();
    }
  }
}

function feedbackSetThreadLoading() {
  feedbackSetHidden(
    feedbackEl(
      "feedback-detail-placeholder"
    ),
    true
  );

  feedbackSetHidden(
    feedbackEl(
      "feedback-detail-error"
    ),
    true
  );

  feedbackSetHidden(
    feedbackEl(
      "feedback-thread"
    ),
    true
  );

  feedbackSetHidden(
    feedbackEl(
      "feedback-detail-loading"
    ),
    false
  );
}

function feedbackSetThreadError() {
  feedbackSetHidden(
    feedbackEl(
      "feedback-detail-placeholder"
    ),
    true
  );

  feedbackSetHidden(
    feedbackEl(
      "feedback-detail-loading"
    ),
    true
  );

  feedbackSetHidden(
    feedbackEl(
      "feedback-thread"
    ),
    true
  );

  feedbackSetHidden(
    feedbackEl(
      "feedback-detail-error"
    ),
    false
  );
}

function feedbackRenderSelectedState() {
  document
    .querySelectorAll(
      ".feedback-list-item"
    )
    .forEach(button => {
      const selected =
        button.dataset.postId ===
        feedbackState.selectedPostId;

      button.classList.toggle(
        "selected",
        selected
      );

      if (selected) {
        button.setAttribute(
          "aria-current",
          "true"
        );
      } else {
        button.removeAttribute(
          "aria-current"
        );
      }
    });
}

function feedbackCreateMetaLine(
  authorName,
  createdAt
) {
  const fragment =
    document.createDocumentFragment();

  const author =
    document.createElement(
      "span"
    );

  author.textContent =
    feedbackString(
      authorName,
      "사용자"
    );

  const divider =
    document.createElement(
      "span"
    );

  divider.textContent = "·";
  divider.setAttribute(
    "aria-hidden",
    "true"
  );

  const date =
    document.createElement(
      "span"
    );

  date.textContent =
    feedbackDate(
      createdAt,
      true
    );

  fragment.append(
    author,
    divider,
    date
  );

  return fragment;
}

function feedbackCreateComment(
  comment
) {
  const article =
    document.createElement(
      "article"
    );

  article.className =
    "feedback-comment";

  const header =
    document.createElement(
      "div"
    );

  header.className =
    "feedback-comment-head";

  header.append(
    feedbackCreateMetaLine(
      comment &&
        comment.authorDisplayName,

      comment &&
        comment.createdAt
    )
  );

  const body =
    document.createElement(
      "div"
    );

  body.className =
    "feedback-comment-body";

  /*
   * Supabase의 사용자 작성 내용은
   * HTML로 해석하지 않는다.
   */
  body.textContent =
    feedbackString(
      comment &&
        comment.body
    );

  article.append(
    header,
    body
  );

  return article;
}

function feedbackRenderComments() {
  const list =
    feedbackEl(
      "feedback-comments-list"
    );

  const empty =
    feedbackEl(
      "feedback-comments-empty"
    );

  const more =
    feedbackEl(
      "feedback-comments-more-btn"
    );

  if (!list) return;

  list.replaceChildren();

  feedbackState.comments.forEach(
    comment => {
      list.append(
        feedbackCreateComment(
          comment
        )
      );
    }
  );

  feedbackSetHidden(
    empty,
    feedbackState.comments.length > 0
  );

  feedbackSetHidden(
    more,
    !feedbackState.nextCommentCursor
  );

  if (more) {
    more.disabled =
      feedbackState.busyThread;
  }
}

function feedbackRenderThread(
  data
) {
  const post =
    data &&
    data.post &&
    typeof data.post === "object"
      ? data.post
      : null;

  if (!post) {
    throw new Error(
      "FEEDBACK_POST_NOT_FOUND"
    );
  }

  const notice =
    feedbackEl(
      "feedback-thread-notice"
    );

  const title =
    feedbackEl(
      "feedback-thread-title"
    );

  const meta =
    feedbackEl(
      "feedback-thread-meta"
    );

  const body =
    feedbackEl(
      "feedback-thread-body"
    );

  if (notice) {
    feedbackSetHidden(
      notice,
      post.isNotice !== true
    );
  }

  if (title) {
    title.textContent =
      feedbackString(
        post.title,
        "제목 없음"
      );
  }

  if (meta) {
    meta.replaceChildren(
      feedbackCreateMetaLine(
        post.authorDisplayName,
        post.createdAt
      )
    );
  }

  if (body) {
    body.textContent =
      feedbackString(
        post.body
      );
  }

  feedbackState.comments =
    Array.isArray(
      data.comments
    )
      ? data.comments
      : [];

  feedbackState.nextCommentCursor =
    data.nextCommentCursor &&
    typeof data.nextCommentCursor ===
      "object"
      ? data.nextCommentCursor
      : null;

  feedbackRenderComments();

  feedbackSetHidden(
    feedbackEl(
      "feedback-detail-placeholder"
    ),
    true
  );

  feedbackSetHidden(
    feedbackEl(
      "feedback-detail-loading"
    ),
    true
  );

  feedbackSetHidden(
    feedbackEl(
      "feedback-detail-error"
    ),
    true
  );

  feedbackSetHidden(
    feedbackEl(
      "feedback-thread"
    ),
    false
  );
}

async function feedbackSelectPost(
  postId,
  {
    force = false
  } = {}
) {
  const id =
    feedbackString(
      postId
    ).trim();

  if (!id) {
    return;
  }

  if (
    !force &&
    id ===
      feedbackState.selectedPostId &&
    !feedbackState.busyThread
  ) {
    return;
  }

  feedbackState.selectedPostId =
    id;

  feedbackState.comments = [];
  feedbackState.nextCommentCursor =
    null;

  feedbackRenderSelectedState();
  feedbackSetThreadLoading();

  const requestSeq =
    ++feedbackState.threadRequestSeq;

  feedbackState.busyThread = true;

  try {
    const data =
      await feedbackRpc(
        "feedback_get_thread_v2",
        feedbackThreadPayload(
          id,
          null
        )
      );

    if (
      requestSeq !==
        feedbackState.threadRequestSeq ||
      id !==
        feedbackState.selectedPostId
    ) {
      return;
    }

    if (
      data &&
      data.ok === false
    ) {
      throw new Error(
        feedbackString(
          data.error,
          "FEEDBACK_POST_NOT_FOUND"
        )
      );
    }

    feedbackRenderThread(
      data || {}
    );

    feedbackHideGlobalError();
  } catch (error) {
    if (
      requestSeq !==
        feedbackState.threadRequestSeq ||
      id !==
        feedbackState.selectedPostId
    ) {
      return;
    }

    feedbackSetThreadError();

    feedbackShowGlobalError(
      "선택한 피드백 글을 불러오지 못했습니다.",

      () => {
        feedbackSelectPost(
          id,
          {
            force: true
          }
        );
      }
    );

    try {
      console.error(
        "[Teacher Tools Feedback]",
        error
      );
    } catch (_error) {
      // Ignore console failure.
    }
  } finally {
    if (
      requestSeq ===
      feedbackState.threadRequestSeq
    ) {
      feedbackState.busyThread =
        false;
    }
  }
}

function feedbackMergeComments(
  current,
  incoming
) {
  const result = [];
  const seen = new Set();

  [
    ...(Array.isArray(current)
      ? current
      : []),

    ...(Array.isArray(incoming)
      ? incoming
      : [])
  ].forEach(comment => {
    const id =
      feedbackString(
        comment &&
          comment.commentId
      ).trim();

    /*
     * commentId가 없는 예상 밖 응답도
     * 화면 전체를 깨뜨리지는 않게 한다.
     */
    const key =
      id ||
      [
        feedbackString(
          comment &&
            comment.createdAt
        ),

        feedbackString(
          comment &&
            comment.authorDisplayName
        ),

        feedbackString(
          comment &&
            comment.body
        )
      ].join("|");

    if (
      !key ||
      seen.has(key)
    ) {
      return;
    }

    seen.add(key);
    result.push(comment);
  });

  return result;
}

async function feedbackLoadMoreComments() {
  if (
    feedbackState.busyThread ||
    !feedbackState.selectedPostId ||
    !feedbackState.nextCommentCursor
  ) {
    return;
  }

  const postId =
    feedbackState.selectedPostId;

  const cursor =
    feedbackState.nextCommentCursor;

  const button =
    feedbackEl(
      "feedback-comments-more-btn"
    );

  feedbackState.busyThread = true;

  const requestSeq =
    ++feedbackState.threadRequestSeq;

  if (button) {
    button.disabled = true;
    button.textContent =
      "불러오는 중...";
  }

  try {
    const data =
      await feedbackRpc(
        "feedback_get_thread_v2",
        feedbackThreadPayload(
          postId,
          cursor
        )
      );

    if (
      requestSeq !==
        feedbackState.threadRequestSeq ||
      postId !==
        feedbackState.selectedPostId
    ) {
      return;
    }

    if (
      data &&
      data.ok === false
    ) {
      throw new Error(
        feedbackString(
          data.error,
          "FEEDBACK_POST_NOT_FOUND"
        )
      );
    }

    feedbackState.comments =
      feedbackMergeComments(
        feedbackState.comments,

        Array.isArray(
          data &&
            data.comments
        )
          ? data.comments
          : []
      );

    feedbackState.nextCommentCursor =
      data &&
      data.nextCommentCursor &&
      typeof data.nextCommentCursor ===
        "object"
        ? data.nextCommentCursor
        : null;

    feedbackRenderComments();
    feedbackHideGlobalError();
  } catch (error) {
    feedbackShowGlobalError(
      "댓글을 더 불러오지 못했습니다.",

      () => {
        feedbackLoadMoreComments();
      }
    );

    try {
      console.error(
        "[Teacher Tools Feedback]",
        error
      );
    } catch (_error) {
      // Ignore console failure.
    }
  } finally {
    if (
      requestSeq ===
      feedbackState.threadRequestSeq
    ) {
      feedbackState.busyThread =
        false;
    }

    if (button) {
      button.disabled = false;
      button.textContent =
        "댓글 더 보기";
    }

    feedbackRenderComments();
  }
}

async function feedbackRefresh() {
  feedbackHideGlobalError();

  feedbackSetRefreshBusy(
    true
  );

  /*
   * 이전 thread 요청 결과가 늦게 도착해
   * 새 화면을 덮지 못하게 무효화.
   */
  feedbackState.threadRequestSeq += 1;

  feedbackState.selectedPostId =
    "";

  feedbackState.comments = [];
  feedbackState.nextCommentCursor =
    null;

  feedbackState.posts = [];
  feedbackState.nextPostCursor =
    null;

  feedbackSetHidden(
    feedbackEl(
      "feedback-thread"
    ),
    true
  );

  feedbackSetHidden(
    feedbackEl(
      "feedback-detail-error"
    ),
    true
  );

  feedbackSetHidden(
    feedbackEl(
      "feedback-detail-loading"
    ),
    true
  );

  feedbackSetHidden(
    feedbackEl(
      "feedback-detail-placeholder"
    ),
    false
  );

  try {
    await feedbackLoadPosts({
      append: false,
      autoSelect: true
    });
  } finally {
    feedbackSetRefreshBusy(
      false
    );
  }
}

function feedbackBindEvents() {
  const refresh =
    feedbackEl(
      "feedback-refresh-btn"
    );

  const retry =
    feedbackEl(
      "feedback-global-retry-btn"
    );

  const morePosts =
    feedbackEl(
      "feedback-more-btn"
    );

  const moreComments =
    feedbackEl(
      "feedback-comments-more-btn"
    );

  refresh?.addEventListener(
    "click",
    () => {
      feedbackRefresh();
    }
  );

  retry?.addEventListener(
    "click",
    () => {
      const action =
        feedbackState.retryAction;

      feedbackHideGlobalError();

      if (
        typeof action ===
        "function"
      ) {
        action();
      } else {
        feedbackRefresh();
      }
    }
  );

  morePosts?.addEventListener(
    "click",
    () => {
      if (
        !feedbackState
          .nextPostCursor
      ) {
        return;
      }

      feedbackLoadPosts({
        append: true,
        autoSelect: false
      });
    }
  );

  moreComments?.addEventListener(
    "click",
    () => {
      feedbackLoadMoreComments();
    }
  );
}

function feedbackStart() {
  feedbackBindEvents();

  /*
   * Hub launcher는 이미 화면에 렌더링되어 있다.
   * Feedback 네트워크 요청 실패는
   * 상단 도구 실행을 막지 않는다.
   */
  feedbackRefresh();
}

feedbackStart();
