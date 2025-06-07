// Show questionnaire modal first
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('questionnaire-modal');
    modal.classList.add('active');

    const form = document.getElementById('preferences-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const preferences = {
            arrangement: form.arrangement.value,
            focus: form.focus.value,
            style: form.style.value
        };
        modal.classList.remove('active');
        initializeWithPreferences(preferences);
    });
});

function initializeWithPreferences(preferences) {
    // Fetch data and theme configurations from the API
    Promise.all([
        fetch('/api/graph-data').then(response => response.json()),
        fetch('/api/theme-config').then(response => response.json())
    ])
    .then(([graphData, themeConfig]) => {
        initializeVisualization(graphData, themeConfig, preferences);
    })
    .catch(error => console.error('Error fetching data:', error));
}

function initializeVisualization(graphData, themeConfig, preferences) {
    // Set up the SVG container with responsive sizing
    const container = document.getElementById('graph-container');
    let width = container.offsetWidth;
    let height = container.offsetHeight;

    // Create SVG
    const svg = d3.select('#graph-container')
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('background-color', '#000000');

    // Create a group for the visualization
    const g = svg.append('g');

    // Add SVG filters for glow effects
    const defs = svg.append('defs');

    // Base glow filter
    const filter = defs.append('filter')
        .attr('id', 'glow')
        .attr('height', '300%')
        .attr('width', '300%')
        .attr('x', '-100%')
        .attr('y', '-100%');

    filter.append('feGaussianBlur')
        .attr('class', 'blur')
        .attr('stdDeviation', preferences.style === 'minimal' ? '4' : '6')
        .attr('result', 'coloredBlur');

    // Intense glow filter for highlighting
    const filterIntense = defs.append('filter')
        .attr('id', 'glow-intense')
        .attr('height', '300%')
        .attr('width', '300%')
        .attr('x', '-100%')
        .attr('y', '-100%');

    filterIntense.append('feGaussianBlur')
        .attr('stdDeviation', '12')
        .attr('result', 'coloredBlur');

    filterIntense.append('feColorMatrix')
        .attr('type', 'matrix')
        .attr('values', '0 0 0 0 0   0 0 0 0 0   0 0 0 0 0  0 0 0 2 0')
        .attr('in', 'coloredBlur')
        .attr('result', 'intensifiedBlur');

    const feMergeIntense = filterIntense.append('feMerge');
    feMergeIntense.append('feMergeNode').attr('in', 'intensifiedBlur');
    feMergeIntense.append('feMergeNode').attr('in', 'SourceGraphic');

    // Define gradients for each theme
    Object.entries(themeConfig.colors).forEach(([theme, colors]) => {
        const gradient = defs.append('linearGradient')
            .attr('id', `glow-${theme}`)
            .attr('x1', '0%')
            .attr('y1', '0%')
            .attr('x2', '100%')
            .attr('y2', '100%');

        gradient.append('stop')
            .attr('offset', '0%')
            .attr('style', `stop-color:${colors[0]};stop-opacity:1`);

        gradient.append('stop')
            .attr('offset', '100%')
            .attr('style', `stop-color:${colors[1]};stop-opacity:1`);
    });

    // Set up zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([0.2, 4])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
        });

    svg.call(zoom);

    // Create the simulation
    const simulation = d3.forceSimulation(graphData.nodes)
        .force('charge', d3.forceManyBody().strength(-400)) // Reduced repulsion
        .force('collision', d3.forceCollide().radius(60)) // Prevent overlap
        .force('center', d3.forceCenter(width / 2, height / 2).strength(0.1)); // Keep centered

    // Configure additional forces based on arrangement preference
    if (preferences.arrangement === 'chronological') {
        simulation
            .force('x', d3.forceX(d => {
                const yearScale = d3.scaleLinear()
                    .domain([1880, 1950])
                    .range([width * 0.2, width * 0.8]);
                return yearScale(d.year);
            }).strength(0.2))
            .force('y', d3.forceY(height / 2).strength(0.1));
    } else if (preferences.arrangement === 'thematic') {
        const themePositions = {
            heroic: 1,
            romantic: 2,
            philosophical: 3,
            social: 4,
            natural: 5
        };
        simulation
            .force('x', d3.forceX(width / 2).strength(0.1))
            .force('y', d3.forceY(d => {
                const position = themePositions[d.themes[0]] || 3;
                return (position * height) / 6;
            }).strength(0.2));
    }

    // Add link force after node forces
    simulation.force('link', d3.forceLink(graphData.links)
        .id(d => d.id)
        .distance(100) // Reduced distance
        .strength(0.5)); // Increased strength for more stability

    // Create the links
    const links = g.append('g')
        .selectAll('line')
        .data(graphData.links)
        .enter()
        .append('line')
        .attr('class', 'link')
        .style('stroke-width', '3px')
        .style('stroke', 'rgba(255, 255, 255, 0.5)');

    // Create the nodes
    const nodes = g.append('g')
        .selectAll('.node')
        .data(graphData.nodes)
        .enter()
        .append('g')
        .attr('class', 'node');

    // Add circles to nodes
    const nodeSize = preferences.style === 'minimal' ? 35 : 45;
    nodes.append('circle')
        .attr('r', nodeSize)
        .style('fill', d => `url(#glow-${d.themes[0]})`)
        .style('filter', 'url(#glow)');

    // Add labels to nodes
    nodes.append('text')
        .text(d => {
            if (preferences.arrangement === 'chronological') {
                return d.year;
            } else if (preferences.arrangement === 'thematic') {
                return themeConfig.labels[d.themes[0]];
            } else {
                return d.title.split(' ')[0];
            }
        })
        .attr('text-anchor', 'middle')
        .attr('dy', '.3em')
        .style('font-size', preferences.style === 'minimal' ? '12px' : '14px');

    // Handle node click events
    nodes.on('click', showNodeInfo);

    // Set up drag behavior
    const drag = d3.drag()
        .on('start', dragStarted)
        .on('drag', dragging)
        .on('end', dragEnded);

    nodes.call(drag);

    // Constrain nodes to viewport
    function constrainToBounds(d) {
        const radius = 45; // Node radius + padding
        d.x = Math.max(radius, Math.min(width - radius, d.x));
        d.y = Math.max(radius, Math.min(height - radius, d.y));
    }

    // Update function for the simulation
    simulation.on('tick', () => {
        // Constrain nodes to viewport
        nodes.each(constrainToBounds);

        links
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        nodes
            .attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Add animations if style is 'animated'
    if (preferences.style === 'animated') {
        nodes.selectAll('circle')
            .style('animation', d => {
                const duration = d.animation ? d.animation.duration : 2000;
                return `pulse ${duration}ms infinite`;
            });
    }

    // Show node information in the panel
    function showNodeInfo(event, d) {
        event.stopPropagation();
        
        // Reset previous selection
        nodes.classed('selected', false);
        d3.select(this).classed('selected', true);

        const infoPanel = document.getElementById('info-panel');
        const nodeInfo = document.getElementById('node-info');
        
        // Get context based on focus preference
        let contextInfo = '';
        if (preferences.focus === 'historical') {
            contextInfo = `<p><strong>Исторически контекст:</strong> ${d.contexts.historical}</p>`;
        } else if (preferences.focus === 'literary') {
            contextInfo = `<p><strong>Литературен контекст:</strong> ${d.contexts.literary}</p>`;
        } else {
            contextInfo = `<p><strong>Тематичен контекст:</strong> ${d.contexts.thematic}</p>`;
        }

        // Get description based on style preference
        const description = preferences.style === 'minimal' ? d.summaries.minimal : d.summaries.detailed;

        nodeInfo.innerHTML = `
            <button class="close-button" aria-label="Затвори"></button>
            <h3>${d.title}</h3>
            <p><strong>Автор:</strong> ${d.author}</p>
            <p><strong>Година:</strong> ${d.year}</p>
            <p><strong>Период:</strong> ${d.period}</p>
            <p><strong>Теми:</strong> ${d.themes.map(t => themeConfig.labels[t]).join(', ')}</p>
            <p><strong>Описание:</strong> ${description}</p>
            ${contextInfo}
            ${d.resources && d.resources.length > 0 ? `
                <p><strong>Ресурси:</strong></p>
                <ul class="resources-list">
                    ${d.resources.map(resource => `
                        <li><a href="${resource.url}" target="_blank" rel="noopener noreferrer">${resource.title}</a></li>
                    `).join('')}
                </ul>
            ` : ''}
        `;
        
        infoPanel.classList.add('expanded');

        // Highlight connected nodes
        highlightConnections(d);

        // Set up close button handler
        const closeButton = nodeInfo.querySelector('.close-button');
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            closeInfoPanel();
        });

        // Close panel when clicking outside
        document.addEventListener('click', handleOutsideClick);
    }

    function highlightConnections(selectedNode) {
        // Reset all nodes and links to default state
        nodes.selectAll('circle')
            .style('filter', 'url(#glow)')
            .style('opacity', 0.7);
            
        links
            .style('stroke', 'rgba(255, 255, 255, 0.5)')
            .style('stroke-width', '3px')
            .style('opacity', 0.5);

        // Find connected links and nodes
        const connectedLinks = graphData.links
            .filter(link => link.source.id === selectedNode.id || link.target.id === selectedNode.id);
        
        const connectedNodes = connectedLinks
            .map(link => link.source.id === selectedNode.id ? link.target.id : link.source.id);

        // Highlight connected links
        links
            .filter(link => link.source.id === selectedNode.id || link.target.id === selectedNode.id)
            .style('stroke', d => {
                const nodeTheme = d.source.id === selectedNode.id ? 
                    d.source.themes[0] : d.target.themes[0];
                return themeConfig.colors[nodeTheme][0];
            })
            .style('stroke-width', '4px')
            .style('opacity', 1);

        // Highlight connected nodes
        nodes.filter(node => connectedNodes.includes(node.id))
            .select('circle')
            .style('opacity', 0.9);

        // Make selected node most prominent
        nodes.filter(node => node.id === selectedNode.id)
            .select('circle')
            .style('filter', 'url(#glow-intense)')
            .style('opacity', 1);
    }

    function closeInfoPanel() {
        const infoPanel = document.getElementById('info-panel');
        infoPanel.classList.remove('expanded');
        nodes.classed('selected', false);
        
        // Reset all visual elements to default state
        nodes.selectAll('circle')
            .style('filter', 'url(#glow)')
            .style('opacity', 1);
            
        links
            .style('stroke', 'rgba(255, 255, 255, 0.5)')
            .style('stroke-width', '3px')
            .style('opacity', 0.5);
            
        document.removeEventListener('click', handleOutsideClick);
    }

    function handleOutsideClick(e) {
        const infoPanel = document.getElementById('info-panel');
        if (!infoPanel.contains(e.target) && !e.target.closest('.node')) {
            closeInfoPanel();
        }
    }

    // Drag functions
    function dragStarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragging(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    function dragEnded(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    // Add legend
    const legend = svg.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(20, ${height - (Object.keys(themeConfig.colors).length * 30 + 10)})`);

    Object.entries(themeConfig.labels).forEach(([theme, label], i) => {
        const legendItem = legend.append('g')
            .attr('transform', `translate(0, ${i * 30})`);

        legendItem.append('circle')
            .attr('r', 8)
            .style('fill', `url(#glow-${theme})`)
            .style('filter', 'url(#glow)');

        legendItem.append('text')
            .attr('x', 20)
            .attr('y', 5)
            .style('fill', '#fff')
            .style('font-size', '14px')
            .text(label);
    });

    // Add zoom controls
    const zoomControls = document.createElement('div');
    zoomControls.className = 'zoom-controls';
    zoomControls.innerHTML = `
        <button class="zoom-btn" id="zoom-in">+</button>
        <button class="zoom-btn" id="zoom-out">−</button>
    `;
    document.body.appendChild(zoomControls);

    document.getElementById('zoom-in').addEventListener('click', () => {
        svg.transition().duration(300).call(zoom.scaleBy, 1.5);
    });

    document.getElementById('zoom-out').addEventListener('click', () => {
        svg.transition().duration(300).call(zoom.scaleBy, 0.75);
    });

    // Initial zoom to fit
    setTimeout(() => {
        const bounds = g.node().getBBox();
        const fullWidth = bounds.width;
        const fullHeight = bounds.height;
        const scale = 0.8 / Math.max(fullWidth / width, fullHeight / height);
        const transform = d3.zoomIdentity
            .translate(
                width / 2 - scale * (bounds.x + fullWidth / 2),
                height / 2 - scale * (bounds.y + fullHeight / 2)
            )
            .scale(scale);

        svg.transition()
            .duration(750)
            .call(zoom.transform, transform);
    }, 500);

    // Handle window resize
    function handleResize() {
        width = container.offsetWidth;
        height = container.offsetHeight;
        
        svg.attr('viewBox', `0 0 ${width} ${height}`);
        legend.attr('transform', `translate(20, ${height - (Object.keys(themeConfig.colors).length * 30 + 10)})`);
        
        // Update center force
        simulation.force('center', d3.forceCenter(width / 2, height / 2).strength(0.1));
        
        // Update position-based forces
        if (preferences.arrangement === 'chronological') {
            simulation.force('x', d3.forceX(d => {
                const yearScale = d3.scaleLinear()
                    .domain([1880, 1950])
                    .range([width * 0.2, width * 0.8]);
                return yearScale(d.year);
            }).strength(0.2));
        }
        
        simulation.alpha(0.3).restart();
    }

    window.addEventListener('resize', handleResize);
} 