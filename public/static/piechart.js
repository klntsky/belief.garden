// public/static/piechart.js

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await createPieChart();
  } catch (_) {

  }
});

window.chart = null;

// Expose the function to re-fetch and re-render the pie chart globally
async function refreshPieChart() {
  if (!window.chart) {
    await createPieChart();
  } else {
    const userId = window.userId;

    const canvas = document.querySelector('#pie-chart-container canvas');

    const pieChartContainer = document.getElementById('pie-chart-container');
    const { labels, data, beliefs } = await fetchUserPieChart(userId);

    if (isMobile) {
      pieChartContainer.style.height = (500 + 30 * labels.length) + 'px';
    }

    if (labels.length === 0) {
      canvas.style.display = 'none';
      document.querySelector('#no-favs').style.display = 'block';
    } else {
      canvas.style.display = 'block';
      document.querySelector('#no-favs').style.display = 'none';
    }

    window.chart.data.labels = labels;
    window.chart.data.datasets[0].data = data;
    window.chart.data.datasets[0].backgroundColor = generateColors(labels.length);
    window.chart.data.datasets[1].data = beliefs;

    window.chart.update();
  }
}

// Expose the function globally
window.refreshPieChart = refreshPieChart;

async function createPieChart() {
  const userId = window.userId;
  const isReadOnly = userId !== window.authenticatedUserId;

  const pieChartContainer = document.getElementById('pie-chart-container');

  // Fetch pie chart data
  const { labels, data, beliefs } = await fetchUserPieChart(userId);
  const ctx = document.createElement('canvas');
  if (isMobile) {
    pieChartContainer.style.height = (500 + 30 * labels.length) + 'px';
  }

  if (labels.length === 0) {
    ctx.style.display = 'none';
    document.querySelector('#no-favs').style.display = 'block';
  } else {
    ctx.style.display = 'block';
    document.querySelector('#no-favs').style.display = 'none';
  }

  const scrollPosition = window.scrollY; // Save scroll position
  // pieChartContainer.innerHTML = ''; // Clear existing content
  pieChartContainer.appendChild(ctx);
  window.scrollTo(0, scrollPosition); // Restore scroll position

  const canvas = document.querySelector('#pie-chart-container canvas');

  let subtitleConfig = undefined;
  if (!isReadOnly) {
    subtitleConfig = {
      display: true,
      text: '                         𝗰𝗹𝗶𝗰𝗸: increase preference, 𝗿𝗶𝗴𝗵𝘁 𝗰𝗹𝗶𝗰𝗸: decrease',
      position: 'bottom',
      color: '#A44',
      align: 'start',
    };
  }

  window.chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [
        {
          data: data,
          backgroundColor: generateColors(labels.length),
        },
        {
          data: beliefs
        }
      ],
    },
    options: {
      radius: isMobile ? 170 : 170,
      maintainAspectRatio: false,
      layout: {
        padding: 20 // Add padding to make the pie chart visually smaller,
      },
      plugins: {
        subtitle: subtitleConfig,
        legend: {
          position: isMobile ? 'bottom' : 'right',
          onClick: (event, legendItem, legend) => {
            const elementIndex = legendItem.index;
            const beliefName = window.chart.data.datasets[1].data[elementIndex];
            console.log(beliefName);
            handleNavigation(beliefName);
          },
          onHover: (event, legendItem) => {
            const elementIndex = legendItem.index;
            const beliefName = window.chart.data.datasets[1].data[elementIndex];
            canvas.style.cursor = 'pointer';
            canvas.title = 'Scroll to ' + beliefName;
          },
          onLeave: () => {
            canvas.style.cursor = 'default';
            delete canvas.title;
          },
        },
      },
      responsive: true,
      onClick: (event, elements) => {
        if (isReadOnly) return;
        console.log(event);
        let increase = true;
        if (event.type == 'contextmenu') {
          increase = false;
        }

        if (elements.length > 0) {
          const elementIndex = elements[0].index;
          const beliefName = window.chart.data.datasets[1].data[elementIndex];
          const beliefLabel = window.chart.data.labels[elementIndex];
          // Increase the slice size
          adjustPieSlice(beliefName, beliefLabel, increase);
        }
      },
    },
  });

  canvas.oncontextmenu = (evt) => {
    evt.preventDefault();
    evt.cancelBubble = true;
    evt.stopPropagation();
  };

  return chart;
}

function toBoldUnicode(text) {
  const boldUnicodeUpperStart = 0x1D400; // Unicode code point for 𝐀
  const boldUnicodeLowerStart = 0x1D41A; // Unicode code point for 𝐚

  return text.split('').map(char => {
    const code = char.charCodeAt(0);

    if (code >= 65 && code <= 90) { // A-Z
      return String.fromCodePoint(boldUnicodeUpperStart + (code - 65));
    } else if (code >= 97 && code <= 122) { // a-z
      return String.fromCodePoint(boldUnicodeLowerStart + (code - 97));
    } else {
      return char; // Non-alphabetic characters are unchanged
    }
  }).join('');
}

const formatChoice = window.formatChoice = (choice, title, mode = 'dark') => {
  if (choice === 'support') {
    return '🟢 supports   ' + toBoldUnicode(title);
  } else if (choice === 'neutral') {
    return (mode == 'light' ? '⚪' : '⚫') +' neutral to  ' + toBoldUnicode(title);
  } else if (choice === 'reject') {
    return '🔴 rejects      ' + toBoldUnicode(title);
  } else {
    return '❓ no choice  ' + toBoldUnicode(title);
  }
}

// Fetch user's pie chart data
async function fetchUserPieChart(userId) {
  const pieChartData = await fetchUserBeliefs(userId);
  const selected = Object.entries(pieChartData).filter(([ title, { preference }]) =>
    preference);

  const labels = selected.map(([title, { choice }]) =>
    formatChoice(choice, title)
  );

  const beliefs = selected.map(([title]) => title);

  const data = selected.map(([ _, { preference }]) => preference);

  return { labels, data, beliefs };
}

// Generate colors for the pie chart
function generateColors(count) {
  const colors = [];
  for (let i = 0; i < count; i++) {
    colors.push(`hsl(${(i * 360) / count}, 70%, 70%)`);
  }
  return colors;
}

// Adjust pie slice size
function adjustPieSlice(beliefName, beliefLabel, increase) {
  const userId = window.userId;
  if (userId !== window.authenticatedUserId) {
    console.warn('Cannot modify pie chart for another user.');
    return;
  }

  fetch(
    `/api/user-piechart/${encodeURIComponent(userId)}/${encodeURIComponent(
      beliefName
    )}/${increase ? 'increase' : 'decrease'}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
    .then((response) => response.json()
          .then((data) => ({ ...data, status: response.status})))
    .then((updatedData) => {
      if (updatedData.status === 200) {
        // Update chart data
        const index = window.chart.data.labels.indexOf(beliefLabel);
        if (index !== -1) {
          window.chart.data.datasets[0].data[index] = updatedData.preference;
          window.chart.update();
        }
      } else {
        // Display error using Toastify.js
        Toastify({
          text: updatedData.error,
          duration: 5000,
          gravity: 'top',
          position: 'right',
          backgroundColor: '#d32f2f',
        }).showToast();
      }
    })
    .catch((error) => {
      console.error('Error adjusting pie slice:', error);
    });
}
