import { App, ColorComponent, Editor, HexString, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, ValueComponent } from 'obsidian';

interface TermManagerSettings {
	mySetting: string;
	term_colour: HexString;
	term_bold: boolean;
	term_italics: boolean;
	defn_colour: HexString;
	defn_bold: boolean;
	defn_italics: boolean;
}

interface dictionary {
	text: string,
	termColour: HexString,
	defnColour: HexString,
	termBold: boolean,
	termItalics: boolean,
	defnBold: boolean,	
	defnItalics: boolean,
}

interface termDictionary {
	[term: string]: string;
}

const DEFAULT_SETTINGS: TermManagerSettings = {
	mySetting: 'default',
	term_colour: '#FFFFFF',
	term_bold: true,
	term_italics: false,
	defn_colour: '#FFFFFF',
	defn_bold: false,
	defn_italics: false
}


export default class TermManager extends Plugin {
	settings: TermManagerSettings;
	termDict: termDictionary = {};
	defsNote: TFile | null;
	defaultHeadings: string = "# A\n---\n# B\n---\n# C\n---\n# D\n---\n# E\n---\n# F\n---\n# G\n---\n# H\n---\n# I\n---\n# J\n---\n# K\n---\n# L\n---\n# M\n---\n# N\n---\n# O\n---\n# P\n---\n# Q\n---\n# R\n---\n# S\n---\n# T\n---\n# U\n---\n# V\n---\n# W\n---\n# X\n---\n# Y\n---\n# Z\n---\n";
	termRegex: RegExp = />[a-zA-Z][a-zA-Z0-9 ]*</;
	async onload() {
		await this.loadSettings();
		
		this.app.workspace.onLayoutReady(() => {
			this.getAllTerms();
			this.makeNewFile();
		});

		// This command is used to add a new term's definition
		this.addCommand({
			id: 'define-term',
			name: 'Define Term',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				if (editor.getSelection().match(/^[a-zA-Z][a-zA-Z0-9 ]*$/)) {
					new DefinitionPopup(this.app, this.settings, editor.getSelection(), (formatting: dictionary) => {
						this.defineTerm(editor, formatting);
					}).open();
				} else {
					if (!editor.getSelection().charAt(0).match(/^[a-zA-Z]/)) {
						new Notice("Term must start with an alphabetical character!");
					} else {
						new Notice("Term can only contain alphanumeric characters!");
					}
				}
				
			}
		})

		// This command is used to clear a term's definition
		this.addCommand({
			id: 'clear-term-definition',
			name: 'Clear Term Definition',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				// This regex checks that the selected text has been defined  
				if (editor.getSelection().match(/^\[\[Definitions#\^[a-zA-Z0-9]+|[a-zA-Z0-9]+\]\]/)) {
					// This regex matches the term portion of the hyperlink
					const m: RegExpMatchArray | null = editor.getSelection().match(/\|[a-zA-Z0-9]+/);
					if (m) {
						const termToclear = m[0].substring(1);
						this.removeDefinedTerm(editor, termToclear);
						delete this.termDict[termToclear];
						editor.replaceSelection(termToclear);
						new Notice("Cleared definition!");
					}
				}

			}
		})

		this.addSettingTab(new TMSettingTab(this.app, this));
	}

	onunload() {
		
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async makeNewFile() {
		// Fetch the definitions file
		this.defsNote = this.app.vault.getFileByPath("Definitions.md");
		
		// If the file doesn't exist, make it
		if (!this.defsNote) {
			this.defsNote = await this.app.vault.create("Definitions.md", this.defaultHeadings);
		}
		
		// If the file exists, read it and if it's empty, add the alphabet as headers
		if (this.defsNote) {
			let defsContent = await this.app.vault.read(this.defsNote);
			if (defsContent == "") {
				this.app.vault.modify(this.defsNote, this.defaultHeadings);
				defsContent = await this.app.vault.read(this.defsNote);
			}
		}
	}

	async getAllTerms() {
		await this.makeNewFile();
		
		if (this.defsNote) {
			let defsContent = await this.app.vault.read(this.defsNote);
			let contentList = defsContent.split("\n");
			let currentTerm: string = "";
			
			// Loop through the page's content and add all terms and their definitions to the dictionary 'termDict'
			contentList.forEach((s: string) => {
				let matches: RegExpMatchArray | null = s.match(this.termRegex);
				let temp = "";
				if (matches) {
					temp = matches[0].substring(1, matches[0].length - 1);
				}
				if (s.charAt(0) == "-" && s.substring(0, 3) != "---") {
					currentTerm = temp;
				} else if (s.startsWith("\t")) {
					this.termDict[currentTerm] = temp;
				}
			})
		}
	}

	async defineTerm(editor: Editor, formatting: dictionary) {
		const selectedText = editor.getSelection();
		await this.makeNewFile();

		if (this.defsNote) {

			let defsContent = await this.app.vault.read(this.defsNote);
			
			// Build the string for the term, the definition, the term without spaces, and the new page content
			const termDef = "- " + this.buildDefinitionStyle(true, formatting.termColour, formatting.termItalics, formatting.termBold) + selectedText.charAt(0).toUpperCase() + selectedText.substring(1) + "</span>";
			const termDefNoSpaces = this.removeSpaces(selectedText);
			const defDef = this.buildDefinitionStyle(false, formatting.defnColour, formatting.defnItalics, formatting.defnBold) + formatting.text + "</span>" + ` ^${termDefNoSpaces}`;
			const updatedContent = this.placeTermInOrder(defsContent, termDef, defDef, selectedText);
			
			// Update the page content and replace the selected term with a hyperlink to its definition
			this.app.vault.modify(this.defsNote, updatedContent);
			editor.replaceSelection(`[[Definitions#^${termDefNoSpaces}|${selectedText}]]`);
			this.termDict[selectedText] = formatting.text;

			new Notice("Defined!");
		}
	}

	buildDefinitionStyle(isTerm: boolean, colour: HexString, italicise: boolean, bold: boolean): string {
		// Construct the initial HTML tag and style 
		let start: string;
		if (isTerm) {
			start = `<span class='term' style='color: ${colour}; `;
		} else {
			start = `<span class='definition' style='color: ${colour}; `;
		}
		let end = "'>"
		
		if (italicise) {
			start += `font-style: italic; `;
		}

		if (bold) {
			start += `font-weight: bold; `;
		}
		return start + end;

	}

	removeSpaces(text: string): string {
		let splitted = text.split(" ");
		let formattedText = "";
		// Loop through the term and remove spaces
		splitted.forEach((v) => {
			if (v != " ") {
				if (!v.charAt(0).match("[A-Z]")) {
					formattedText += v.charAt(0).toUpperCase() + v.substring(1);
				} else {
					formattedText += v;
				}
			}
		})
		return formattedText;
	}

	placeTermInOrder(content: string, term: string, defn: string, termName: string): string {
		const contentList: Array<string> = content.split("\n");
		let updatedContent: string = "";
		let check: boolean = false;

		contentList.forEach((s) => {
			// If the line is a heading
			if (s.startsWith("#") && check == false) {
				// If the heading letter matches the first character of the term
				if (s.charAt(2) == termName.charAt(0).toUpperCase()) {
					check = true;
				}

			} else if (check == true) {
				// If the line is a term
				if (s.startsWith("-") && !s.startsWith("---")) {
					// Extract the term from the HTML
					let matches: RegExpMatchArray | null = s.match(this.termRegex);

					if (matches) {
						// Check that the new term alphabetically precedes the current line
						let temp = matches[0].substring(1, matches[0].length - 1).toLowerCase();
						if (termName.toLowerCase() < temp) {
							updatedContent += `${term}\n\t${defn}\n`;
							check = false;
						}
					}

				} else if (!s.startsWith("\t")){
					// Otherwise, add the line to the page's content
					updatedContent += `${term}\n\t${defn}\n`;
					check = false;
				}
			}
			updatedContent += s + "\n";
		})
		return updatedContent;
	}

	async removeDefinedTerm(editor: Editor, termToclear: string) {
		if (this.defsNote) {
			let defsContent = await this.app.vault.read(this.defsNote);	
			if (defsContent) {
				let updatedContent: string = "";
				let contentList = defsContent.split("\n");
				let removeDef: boolean = false;
				
				// Loop through each line to find the term to delete 
				contentList.forEach((s: string) => {
					// If the line is a defined term (not a heading nor a separating line)
					if (s.startsWith("-") && !s.startsWith("---")) {
						// Regex to filter out the HTML content from the string;
						let matches: RegExpMatchArray | null = s.match(this.termRegex);
						
						// Check the terms match, then ignore it and its definition 
						if (matches) {
							let temp = matches[0].substring(1, matches[0].length - 1).toLowerCase();
							if (temp != termToclear.toLowerCase()) {
								updatedContent += s + "\n";
							} else {
								removeDef = true;
							}
						}
					} else {
						// Otherwise, add the line to the page's content
						if (removeDef == false) {
							updatedContent += s + "\n";
						}
						removeDef = false;
					}
				})

				this.app.vault.modify(this.defsNote, updatedContent);
			}
		}
	}
}

class TMSettingTab extends PluginSettingTab {
	plugin: TermManager;

	constructor(app: App, plugin: TermManager) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();
	
		new Setting(containerEl).setName('Terms').setHeading();
		// Setting to change the default colour of the term
		new Setting(containerEl)
			.setName("Term text colour")
			.setDesc("Change the term's default text colour")
			.addColorPicker((cb: ColorComponent) => {
				cb.setValue(this.plugin.settings.term_colour);
				cb.onChange(async (value) => {
					this.plugin.settings.term_colour = value;
					await this.plugin.saveSettings();
				})
			});

		// Setting to make the term bold
		new Setting(containerEl)
			.setName("Bold term")
			.setDesc("Set the term to be bold")
			.addToggle((btn) => {
				btn.setValue(this.plugin.settings.term_bold);
				btn.onChange(async (value) => {
					this.plugin.settings.term_bold = value;
					await this.plugin.saveSettings();
				})
			})
		
		// Setting to italicise the term
		new Setting(containerEl)
			.setName("Italicise term")
			.setDesc("Set the term to be italicised")
			.addToggle((btn) => {
				btn.setValue(this.plugin.settings.term_italics);
				btn.onChange(async (value) => {
					this.plugin.settings.term_italics = value;
					await this.plugin.saveSettings();
				})
			})

		
		new Setting(containerEl).setName('Definitions').setHeading();
		// Setting to change the default colour of the definitions
		new Setting(containerEl)
			.setName("Definition text colour")
			.setDesc("Change the definition's default text colour")
			.addColorPicker((cb: ColorComponent) => {
				cb.setValue(this.plugin.settings.defn_colour);
				cb.onChange(async (value) => {
					this.plugin.settings.defn_colour = value;
					await this.plugin.saveSettings();
				})
			})

		// Setting to make the definition bold
		new Setting(containerEl)
			.setName("Bold definition")
			.setDesc("Set the definition to be bold")
			.addToggle((btn) => {
				btn.setValue(this.plugin.settings.defn_bold);
				btn.onChange(async (value) => {
					this.plugin.settings.defn_bold = value;
					await this.plugin.saveSettings();
				})
			})

		// Setting to italicise the definition
		new Setting(containerEl)
			.setName("Italicise definition")
			.setDesc("Set the definition to be italicised")
			.addToggle((btn) => {
				btn.setValue(this.plugin.settings.defn_italics);
				btn.onChange(async (value) => {
					this.plugin.settings.defn_italics = value;
					await this.plugin.saveSettings();
				})
			})

	}
}

class DefinitionPopup extends Modal {
	settings: TermManagerSettings;
	termToDefine: string;
	formatting: dictionary = {
		text: "",
		termColour: "",
		defnColour: "",
		termBold: false,
		termItalics: false,
		defnBold: false,
		defnItalics: false
	};

	onSubmit: (formatting: dictionary) => void;

	constructor(app: App, settings: TermManagerSettings, term: string, onSubmit: (formatting: dictionary) => void) {
		super(app);
		this.settings = settings;
		this.onSubmit = onSubmit;
		this.termToDefine = term;
		this.formatting.termBold = this.settings.term_bold;
		this.formatting.termItalics = this.settings.term_italics;
		this.formatting.defnBold = this.settings.defn_bold;
		this.formatting.defnItalics = this.settings.defn_italics;
	}

	onOpen() {
		const { contentEl } = this;

		// Title of the popup
		contentEl.createEl("h1", { text: `Define '${this.termToDefine}'` });

		// Adds an input box to write the definition
		new Setting(contentEl)
		.setName("Definition")
		.setDesc("Write the definition for this term here")
		.addText((text) =>
			text.onChange((value) => {
				this.formatting.text = value;
			})
		);
		
		// Adds a colour picker for the term
		// Default found in this.settings
		new Setting(contentEl)
		.setName("Term colour")
		.setDesc(`Default: ${this.settings.term_colour}`)
		.addColorPicker((cb) => {
			cb.setValue(this.settings.term_colour);
			this.formatting.termColour = this.settings.term_colour;
			cb.onChange((value) => {
				this.formatting.termColour = value;
			})
		})

		// Adds a colour picker for the definition
		// Default found in this.settings
		new Setting(contentEl)
		.setName("Definition colour")
		.setDesc(`Default: ${this.settings.defn_colour}`)
		.addColorPicker((cb) => {
			cb.setValue(this.settings.defn_colour);
			this.formatting.defnColour = this.settings.defn_colour;
			cb.onChange((value) => {
				this.formatting.defnColour = value;
			})
		})

		// Adds a submit button to the popup
		new Setting(contentEl)
		.addButton((btn) =>
			btn
			.setButtonText("Create")
			.setCta()
			.onClick(() => {
				this.close();
				this.onSubmit(this.formatting);
			})
		)
	}

	onClose() {
		let { contentEl } = this;
		contentEl.empty();
	}
}

// DEPRECATED

// new Setting(contentEl)
// .setName("Embolden Term")
// .setDesc("Default: True")
// .addToggle((cb) => {
// 	cb.setValue(true);
// 	cb.onChange((value) => {
// 		this.formatting.termBold = value;
// 	})
// })

// new Setting(contentEl)
// .setName("Italicise Term")
// .setDesc("Default: False")
// .addToggle((cb) => {
// 	cb.setValue(false);
// 	cb.onChange((value) => {
// 		this.formatting.termItalics = value;
// 	})
// })

// new Setting(contentEl)
// .setName("Embolden Definition")
// .setDesc("Default: False")
// .addToggle((cb) => {
// 	cb.setValue(false);
// 	cb.onChange((value) => {
// 		this.formatting.defnBold = value;
// 	})
// })

// new Setting(contentEl)
// .setName("Italicise Definition")
// .setDesc("Default: False")
// .addToggle((cb) => {
// 	cb.setValue(false);
// 	cb.onChange((value) => {
// 		this.formatting.defnItalics = value;
// 	})
// })