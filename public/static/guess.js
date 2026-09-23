(function () {
  'use strict';

  const page = document.querySelector('.guess-page');
  if (!page) return;

  const username = page.dataset.profileUserId;
  const validChoices = new Set(['reject', 'neutral', 'support']);
  const elements = {
    loading: document.getElementById('guess-loading'),
    error: document.getElementById('guess-error'),
    errorMessage: document.getElementById('guess-error-message'),
    intro: document.getElementById('guess-intro'),
    game: document.getElementById('guess-game'),
    complete: document.getElementById('guess-complete'),
    total: document.getElementById('guess-total-count'),
    start: document.getElementById('guess-start'),
    card: document.getElementById('guess-card'),
    category: document.getElementById('guess-category'),
    name: document.getElementById('guess-belief-name'),
    description: document.getElementById('guess-belief-description'),
    choices: document.getElementById('guess-choices'),
    reveal: document.getElementById('guess-reveal'),
    result: document.getElementById('guess-result'),
    answer: document.getElementById('guess-answer'),
    comment: document.getElementById('guess-comment'),
    next: document.getElementById('guess-next'),
    correct: document.getElementById('guess-correct-count'),
    attempts: document.getElementById('guess-attempt-count'),
    remaining: document.getElementById('guess-remaining-count'),
    progress: document.getElementById('guess-progress-fill'),
    finalCorrect: document.getElementById('guess-final-correct'),
    finalTotal: document.getElementById('guess-final-total'),
    finalMessage: document.getElementById('guess-final-message'),
    replay: document.getElementById('guess-replay'),
  };

  let beliefs = [];
  let beliefsByName = new Map();
  let state = { order: [], index: 0, correct: 0 };
  let answeredCurrentCard = false;

  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function showOnly(element) {
    [elements.loading, elements.error, elements.intro, elements.game, elements.complete]
      .forEach(section => { section.hidden = section !== element; });
  }

  function newGame() {
    state = {
      order: shuffle(beliefs.map(belief => belief.name)),
      index: 0,
      correct: 0,
    };
  }

  function updateScore() {
    elements.correct.textContent = String(state.correct);
    elements.attempts.textContent = String(state.index);
    elements.remaining.textContent = String(state.order.length - state.index);
    const percentage = state.order.length ? (state.index / state.order.length) * 100 : 0;
    elements.progress.style.width = `${percentage}%`;
  }

  function renderCard() {
    if (state.index >= state.order.length) {
      renderComplete();
      return;
    }

    const belief = beliefsByName.get(state.order[state.index]);
    if (!belief) {
      state.index += 1;
      renderCard();
      return;
    }

    answeredCurrentCard = false;
    elements.category.textContent = belief.category;
    elements.name.textContent = belief.name;
    elements.description.textContent = belief.description;
    elements.card.style.backgroundImage = `url("/img/min/${encodeURIComponent(belief.name)}.webp")`;
    elements.card.style.backgroundSize = 'cover';
    elements.card.style.backgroundPosition = 'center';
    elements.card.style.backgroundRepeat = 'no-repeat';
    elements.reveal.hidden = true;
    elements.answer.hidden = true;
    elements.answer.replaceChildren();
    elements.comment.hidden = true;
    elements.comment.textContent = '';
    elements.choices.classList.remove('has-selection');
    elements.choices.querySelectorAll('button').forEach(button => {
      button.disabled = false;
      button.classList.remove('selected');
      button.removeAttribute('aria-pressed');
    });
    elements.next.textContent = state.index === state.order.length - 1 ? 'See my score' : 'Next belief';
    updateScore();
    showOnly(elements.game);
  }

  function submitGuess(guess) {
    if (answeredCurrentCard) return;
    const belief = beliefsByName.get(state.order[state.index]);
    if (!belief) return;

    answeredCurrentCard = true;
    const isCorrect = guess === belief.choice;
    if (isCorrect) state.correct += 1;
    state.index += 1;

    elements.choices.querySelectorAll('button').forEach(button => {
      button.disabled = true;
      if (button.dataset.choice === guess) {
        button.classList.add('selected');
        button.setAttribute('aria-pressed', 'true');
      }
    });
    elements.choices.classList.add('has-selection');

    elements.result.textContent = isCorrect ? 'Correct!' : 'Not quite.';
    if (!isCorrect) {
      const correctChoice = document.createElement('button');
      correctChoice.type = 'button';
      correctChoice.disabled = true;
      correctChoice.classList.add('choice-button', belief.choice, 'selected');
      correctChoice.textContent = belief.choice;
      elements.answer.replaceChildren(
        document.createTextNode('Correct choice: '),
        correctChoice,
      );
      elements.answer.hidden = false;
    }
    if (belief.comment) {
      elements.comment.textContent = `“${belief.comment}”`;
      elements.comment.hidden = false;
    }
    elements.reveal.hidden = false;
    updateScore();
    elements.next.focus();
  }

  function getFinalMessage(score, total) {
    const ratio = total ? score / total : 0;
    if (ratio === 1) return `Perfect score—you know ${username} extremely well.`;
    if (ratio >= 0.8) return `You know ${username} very well.`;
    if (ratio >= 0.6) return 'Good score, with a few surprises.';
    if (ratio >= 0.4) return 'You know some of their views.';
    return `${username} still has plenty of surprises for you.`;
  }

  function renderComplete() {
    elements.finalCorrect.textContent = String(state.correct);
    elements.finalTotal.textContent = String(state.order.length);
    elements.finalMessage.textContent = getFinalMessage(state.correct, state.order.length);
    showOnly(elements.complete);
  }

  async function initialize() {
    try {
      const encodedUsername = encodeURIComponent(username);
      const [beliefDefinitionsResponse, userBeliefsResponse] = await Promise.all([
        fetch('/static/beliefs.json'),
        fetch(`/api/user-beliefs/${encodedUsername}`),
      ]);
      if (!beliefDefinitionsResponse.ok || (
        !userBeliefsResponse.ok && userBeliefsResponse.status !== 404
      )) {
        throw new Error('Could not load this belief deck.');
      }

      const beliefDefinitions = await beliefDefinitionsResponse.json();
      const userBeliefs = userBeliefsResponse.ok
        ? await userBeliefsResponse.json()
        : {};
      beliefs = Object.entries(beliefDefinitions).flatMap(([category, categoryBeliefs]) =>
        categoryBeliefs
          .filter(belief => validChoices.has(userBeliefs[belief.name]?.choice))
          .map(belief => ({
            category,
            name: belief.name,
            description: belief.description,
            choice: userBeliefs[belief.name].choice,
            comment: typeof userBeliefs[belief.name].comment === 'string'
              ? userBeliefs[belief.name].comment.trim()
              : '',
          }))
      );

      if (!beliefs.length) {
        showOnly(elements.error);
        return;
      }

      beliefsByName = new Map(beliefs.map(belief => [belief.name, belief]));
      newGame();

      elements.total.textContent = String(beliefs.length);
      showOnly(elements.intro);
    } catch (error) {
      elements.errorMessage.textContent = error instanceof Error
        ? error.message
        : 'Could not load this belief deck.';
      showOnly(elements.error);
    }
  }

  elements.start.addEventListener('click', renderCard);
  elements.next.addEventListener('click', renderCard);
  elements.replay.addEventListener('click', () => {
    newGame();
    renderCard();
  });
  elements.choices.addEventListener('click', event => {
    const button = event.target.closest('button[data-choice]');
    if (button) submitGuess(button.dataset.choice);
  });

  initialize();
}());
