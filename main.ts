import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';
import matter from 'gray-matter';
import { createHash } from 'crypto';


interface ObsidianBookstackSettings {
	bookstack_url: string;
	bookstack_token_id: string;
	bookstack_token_secret: string;
	debug_mode: boolean;
}

const DEFAULT_SETTINGS: ObsidianBookstackSettings = {
	bookstack_url: '',
	bookstack_token_id: '',
	bookstack_token_secret: '',
	debug_mode: true,
}

export default class ObsidianBookstackPlugin extends Plugin {
	settings: ObsidianBookstackSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('book-up', 'Obsidian Bookstack', async (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			// Make sure the user is editing a Markdown file.
			if (view) {
				const page_content = view.getViewData();
				let result = await this.postBookstack(page_content);
				const { updated, checksum, id: page_id } = result;
				if (updated) {
					const new_content =  this.updatePageProperties(page_id, checksum, page_content);
					view.editor.setValue(new_content);
					new Notice('Published to Bookstack!');
				} else {
					new Notice('No need to update since the page is up to date');
				}
			} else {
				new Notice('Please open a Markdown file to publish to Bookstack');
			}
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		// const statusBarItemEl = this.addStatusBarItem();
		// statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		// this.addCommand({
		// 	id: 'open-sample-modal-simple',
		// 	name: 'Open sample modal (simple)',
		// 	callback: () => {
		// 		new SampleModal(this.app).open();
		// 	}
		// });
		// This adds an editor command that can perform some operation on the current editor instance
		// this.addCommand({
		// 	id: 'sample-editor-command',
		// 	name: 'Sample editor command',
		// 	editorCallback: (editor: Editor, view: MarkdownView) => {
		// 		console.log(editor.getSelection());
		// 		editor.replaceSelection('Sample Editor Command');
		// 	}
		// });

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ObsidianBookstackSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		// this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// 	console.log('click', evt);
		// });

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		// this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async postBookstack(md_content: string) {
	
		const {data, content} = matter(md_content);
		const {book_id, chapter_id, page_id, page_name, checksum} = data;
		if (this.settings.debug_mode) {
			console.debug(book_id, chapter_id, page_id, page_name, checksum);
		}
		const content_hash = createHash('md5').update(content).digest("hex")
		if (checksum === content_hash) {
			if (this.settings.debug_mode) {
				console.debug('no need to update');
			}
			return {'id': page_id, 'checksum': checksum, 'updated': false}
		}
		let holder_id = "";
		let holder_value = 0;
		if (book_id > 0) {
			holder_id = "book_id";
			holder_value = book_id;
		}
		if (chapter_id > 0) {
			holder_id = "chapter_id";
			holder_value = chapter_id;
		}
		let endpoint: string;
		let method: string;
		if (page_id > 0) {
			// update existing page
			endpoint = `${this.settings.bookstack_url}/api/pages/${page_id}`
			method = "PUT"
		} else {
			// create new page
			endpoint = `${this.settings.bookstack_url}/api/pages`
			method = "POST"
		}
	
		const body_data = {
			'name': page_name,
			'markdown': content,
			[holder_id]: holder_value,
		}
	
		const response = await requestUrl({
			url: endpoint,
			method: method,
			headers: {
				'Authorization': `Token ${this.settings.bookstack_token_id}:${this.settings.bookstack_token_secret}`,
				'Content-Type': 'application/json; charset=utf-8'
			},
			body: JSON.stringify(body_data),
		});
		if (response.status !== 200) {
			throw new Error(`Failed to update page: ${response.status}`);
		}
		const return_value = response.json;
	
		if (this.settings.debug_mode) {
			console.debug(return_value);
		}
		return_value['checksum'] = content_hash;
		return_value['updated'] = true;
		return return_value;
	}

	updatePageProperties(page_id: number, checksum: string, page_content: string) {
		// assume this block is frontmatter block, otherwise it will corrupt
		const {data, content} = matter(page_content);
		data['page_id'] = page_id.toString();
		data['checksum'] = checksum;
		let new_content = matter.stringify(content, data);
		return new_content;
	}
}

class ObsidianBookstackSettingTab extends PluginSettingTab {
	plugin: ObsidianBookstackPlugin;

	constructor(app: App, plugin: ObsidianBookstackPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Bookstack Server URL')
			.setDesc('URL to bookstack server.')
			.addText(text => text
				.setPlaceholder('enter bookstack server url')
				.setValue(this.plugin.settings.bookstack_url)
				.onChange(async (value) => {
					if (value ===undefined || value === '') {
						new Notice('Please enter a valid URL');
						return;
					}
					if (!value.startsWith('http://') && !value.startsWith('https://')) {
						value = 'https://' + value;
					}
					this.plugin.settings.bookstack_url = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Bookstack Token ID')
			.setDesc('The token_id value.')
			.addText(text => text
				.setPlaceholder('enter bookstack token id')
				.setValue(this.plugin.settings.bookstack_token_id)
				.onChange(async (value) => {
					if (value ===undefined || value === '') {
						new Notice('Please enter a valid token id');
						return;
					}
					this.plugin.settings.bookstack_token_id = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Bookstack Token Secret')
			.setDesc('The token_secret value.')
			.addText(text => text
				.setPlaceholder('enter bookstack token secret')
				.setValue(this.plugin.settings.bookstack_token_secret)
				.onChange(async (value) => {
					if (value ===undefined || value === '') {
						new Notice('Please enter a valid token secret');
						return;
					}
					this.plugin.settings.bookstack_token_secret = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Toggle Debug Mode')
			.setDesc('Enable will show debug logs in the console.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debug_mode)
				.onChange(async (value) => {
					this.plugin.settings.debug_mode = value;
					await this.plugin.saveSettings();
				}));

	}
}
