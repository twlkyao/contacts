OC.Contacts = OC.Contacts || {};


(function(window, $, OC) {
	'use strict';

	var AddressBook = function(storage, book, template) {
		this.storage = storage;
		this.book = book;
		this.$template = template;
	}

	AddressBook.prototype.render = function() {
		var self = this;
		this.$li = this.$template.octemplate({
			id: this.book.id,
			displayname: this.book.displayname,
			backend: this.book.backend,
			permissions: this.book.permissions
		});
		this.$li.find('a.action').tipsy({gravity: 'w'});
		if(!this.hasPermission(OC.PERMISSION_DELETE)) {
			this.$li.find('a.action.delete').hide();
		}
		if(!this.hasPermission(OC.PERMISSION_UPDATE)) {
			this.$li.find('a.action.edit').hide();
		}
		this.$li.find('a.action.download')
			.attr('href', OC.Router.generate(
				'contacts_address_book_export',
				{
					backend: this.getBackend(),
					addressbookid: this.getId()
				}
			));
		this.$li.find('a.action.delete').on('click keypress', function() {
			$('.tipsy').remove();
			console.log('delete', self.getId());
			self.destroy();
		});
		this.$li.find('a.action.globe').on('click keypress', function() {
			var uri = (self.book.owner === oc_current_user ) ? self.book.uri : self.book.uri + '_shared_by_' + self.book.owner;
			var link = OC.linkToRemote('carddav')+'/addressbooks/'+encodeURIComponent(oc_current_user)+'/'+encodeURIComponent(uri);
			var $dropdown = $('<li><div id="dropdown" class="drop"><input type="text" value="{link}" readonly /></div></li>')
				.octemplate({link:link}).insertAfter(self.$li);
			var $input = $dropdown.find('input');
			$input.focus().get(0).select();
			$input.on('blur', function() {
				$dropdown.hide('blind', function() {
					$dropdown.remove();
				});
			});
		});
		this.$li.find('a.action.edit').on('click keypress', function(event) {
			if($(this).data('open')) {
				return;
			}
			var editor = this;
			event.stopPropagation();
			event.preventDefault();
			var $dropdown = $('<li><div><input type="text" value="{name}" /></div></li>')
				.octemplate({name:self.getDisplayName()}).insertAfter(self.$li);
			var $input = $dropdown.find('input');
			//$input.focus().get(0).select();
			$input.addnew({
				autoOpen: true,
				//autoClose: false,
				addText: t('contacts', 'Save'),
				ok: function(event, name) {
					console.log('edit-address-book ok', name);
					$input.addClass('loading');
					self.update({displayname:name}, function(response) {
						console.log('response', response);
						if(response.error) {
							$(document).trigger('status.contacts.error', response);
						} else {
							self.setDisplayName(response.data.displayname);
							$input.addnew('close');
						}
						$input.removeClass('loading');
					});
				},
				close: function() {
					$dropdown.remove();
					$(editor).data('open', false);
				}
			});
			$(this).data('open', true);
		});
		return this.$li;
	};

	AddressBook.prototype.getId = function() {
		return this.book.id;
	};

	AddressBook.prototype.getBackend = function() {
		return this.book.backend;
	};

	AddressBook.prototype.getDisplayName = function() {
		return this.book.displayname;
	};

	AddressBook.prototype.setDisplayName = function(name) {
		this.book.displayname = name;
		this.$li.find('label').text(escapeHTML(name));
	};

	AddressBook.prototype.getPermissions = function() {
		return this.book.permissions;
	};

	AddressBook.prototype.hasPermission = function(permission) {
		return (this.getPermissions() & permission);
	};

	AddressBook.prototype.getOwner = function() {
		return this.book.owner;
	};

	AddressBook.prototype.getMetaData = function() {
		return {
			permissions:this.getPermissions,
			backend: this.getBackend(),
			id: this.getId(),
			displayname: this.getDisplayName()
		};
	};

	/**
	 * Update address book in data store
	 * @param object properties An object current only supporting the property 'displayname'
	 * @param cb Optional callback function which
	 * @return An object with a boolean variable 'error'.
	 */
	AddressBook.prototype.update = function(properties, cb) {
		var self = this;
		return $.when(this.storage.updateAddressBook(this.getBackend(), self.getId(), {properties:properties}))
			.then(function(response) {
			if(response.error) {
				$(document).trigger('status.contacts.error', response);
			}
			cb(response);
		});
	}

	/**
	 * Delete address book from data store and remove it from the DOM
	 * @param cb Optional callback function which
	 * @return An object with a boolean variable 'error'.
	 */
	AddressBook.prototype.destroy = function(cb) {
		var self = this;
		$.when(this.storage.deleteAddressBook(this.getBackend(), self.getId()))
			.then(function(response) {
			if(!response.error) {
				self.$li.remove();
				$(document).trigger('status.addressbook.removed', {
					addressbook: self
				});
			} else {
				$(document).trigger('status.contacts.error', response);
			}
		}).fail(function(response) {
			console.log(response.message);
			$(document).trigger('status.contacts.error', response);
		});
	}

	/**
	 * Controls access to address books
	 */
	var AddressBookList = function(
			storage,
			bookTemplate,
			bookItemTemplate
  		) {
		this.storage = storage;
		this.$bookTemplate = bookTemplate;
		this.$bookList = this.$bookTemplate.find('.addressbooklist');
		this.$bookItemTemplate = bookItemTemplate;
		this.$importFileInput = this.$bookTemplate.find('#import_upload_start');
		this.$importIntoSelect = this.$bookTemplate.find('#import_into');
		this.$importProgress = this.$bookTemplate.find('#import-status-progress');
		this.$importStatusText = this.$bookTemplate.find('#import-status-text');
		this.addressBooks = [];

		var $addInput = this.$bookTemplate.find('#add-address-book');
		var self = this;
		$addInput.addnew({
			ok: function(event, name) {
				console.log('add-address-book ok', name);
				$addInput.addClass('loading');
				self.add(name, function(response) {
					console.log('response', response);
					if(response.error) {
						$(document).trigger('status.contacts.error', response);
					} else {
						$(this).addnew('close');
					}
					$addInput.removeClass('loading');
				});
			}
		});
		$(document).bind('status.addressbook.removed', function(e, data) {
			var addressBook = data.addressbook;
			self.addressBooks.splice(self.addressBooks.indexOf(addressBook), 1);
			self.buildImportSelect();
		});
		$(document).bind('status.addressbook.added', function(e) {
			self.buildImportSelect();
		});
		this.$importIntoSelect.on('change', function() {
			// Disable file input if no address book selected
			var value = $(this).val();
			self.$importFileInput.prop('disabled', value === '-1' );
			if(value !== '-1') {
				var url = OC.Router.generate(
					'contacts_import_upload',
					{addressbookid:value, backend: $(this).find('option:selected').data('backend')}
				);
				self.$importFileInput.fileupload('option', 'url', url);
				//self.$importFileInput.attr('data-url', url);
			}
		});
		this.$importFileInput.fileupload({
			dataType: 'json',
			start: function(e, data) {
				self.$importProgress.progressbar({value:false});
				$('.tipsy').remove();
				$('.import-upload').hide();
				$('.import-status').show();
				self.$importProgress.fadeIn();
				self.$importStatusText.text(t('contacts', 'Uploading...'));
			},
			done: function (e, data) {
				self.$importStatusText.text(t('contacts', 'Importing...'));
				console.log('Upload done:', data.result);
				self.doImport(data.result);
			},
			fail: function(e, data) {
				console.log('fail', data);
				OC.notify({message:data.errorThrown + ': ' + data.textStatus});
				$('.import-upload').show();
				$('.import-status').hide();
			}
		});
	};

	AddressBookList.prototype.count = function() {
		return this.addressBooks.length;
	}

	AddressBookList.prototype.doImport = function(response) {
		var done = false;
		var interval = null, isChecking = false;
		var self = this;
		var closeImport = function() {
			self.$importProgress.fadeOut();
			setTimeout(function() {
				$('.import-upload').show();
				$('.import-status').hide();
				self.importCount = null;
				self.$importProgress.progressbar('destroy');
			}, 5000);
		};
		if(response.status === 'success') {
			this.importCount = response.data.count;
			this.$importProgress.progressbar('value', 0);
			this.$importProgress.progressbar('option', 'max', this.importCount);
			var data = response.data;
			var getStatus = function(backend, addressbookid, progresskey, interval, done) {
				if(done) {
					clearInterval(interval);
					closeImport();
					return;
				}
				if(isChecking) {
					return;
				}
				isChecking = true;
				$.when(
					self.storage.importStatus(
						backend, addressbookid,
						{progresskey:progresskey}
					))
				.then(function(response) {
					if(!response.error) {
						self.$importProgress.progressbar('value', Number(response.data.progress));
						self.$importStatusText.text(t('contacts', 'Imported {count} of {total} contacts',
													  {count:response.data.progress, total: self.importCount}));
					} else {
						console.warn('Error', response.message);
						self.$importStatusText.text(response.message);
					}
					isChecking = false;
				}).fail(function(response) {
					console.log(response.message);
					$(document).trigger('status.contacts.error', response);
					isChecking = false;
				});
			};
			$.when(
				self.storage.startImport(
					data.backend, data.addressbookid,
					{filename:data.filename, progresskey:data.progresskey}
  				))
				.then(function(response) {
				console.log('response', response);
				if(!response.error) {
					console.log('Import done');
					self.$importStatusText.text(t('contacts', 'Imported {imported} contacts. {failed} failed.',
													  {imported:response.data.imported, failed: response.data.failed}));
					var addressBook = self.find({id:response.data.addressbookid, backend: response.data.backend});
					$(document).trigger('status.addressbook.imported', {
						addressbook: addressBook
					});
				} else {
					self.$importStatusText.text(response.message);
					$(document).trigger('status.contacts.error', response);
				}
				done = true;
			}).fail(function(response) {
				console.log(response.message);
				$(document).trigger('status.contacts.error', response);
				done = true;
			});
			interval = setInterval(function() {
				getStatus(data.backend, data.addressbookid, data.progresskey, interval, done);
			}, 1500);
		} else {
			done = true;
			self.$importStatusText.text(response.data.message);
			closeImport();
			$(document).trigger('status.contacts.error', response);
		}
	}

	/**
	 * Rebuild the select to choose which address book to import into.
	 */
	AddressBookList.prototype.buildImportSelect = function() {
		var self = this;
		this.$importIntoSelect.find('option:not([value="-1"])').remove();
		var addressBooks = this.selectByPermission(OC.PERMISSION_UPDATE);
		$.each(addressBooks, function(idx, book) {
			var $opt = $('<option />');
			$opt.val(book.getId()).text(book.getDisplayName()).data('backend', book.getBackend());
			self.$importIntoSelect.append($opt);
		});
		if(addressBooks.length === 1) {
			this.$importIntoSelect.val(this.$importIntoSelect.find('option:not([value="-1"])').first().val()).hide().trigger('change');
			self.$importFileInput.prop('disabled', false);
		} else {
			this.$importIntoSelect.show();
			self.$importFileInput.prop('disabled', true);
		}
	}

	/**
	 * Create an AddressBook object, save it in internal list and append it's rendered result to the list
	 *
	 * @param object addressBook
	 * @param bool rebuild If true rebuild the address book select for import.
	 * @return AddressBook
	 */
	AddressBookList.prototype.insertAddressBook = function(addressBook) {
		var book = new AddressBook(this.storage, addressBook, this.$bookItemTemplate);
		var result = book.render();
		this.$bookList.append(result);
		this.addressBooks.push(book);
		return book;
	};

	/**
	 * Get an AddressBook
	 *
	 * @param object info An object with the string  properties 'id' and 'backend'
	 * @return AddressBook|null
	 */
	AddressBookList.prototype.find = function(info) {
		console.log('AddressBookList.find', info);
		var addressBook = null;
		$.each(this.addressBooks, function(idx, book) {
			if(book.getId() === info.id && book.getBackend() === info.backend) {
				addressBook = book;
				return false; // break loop
			}
		});
		return addressBook;
	}

	/**
	 * Move a contacts from one address book to another..
	 *
	 * @param Contact The contact to move
	 * @param object from An object with properties 'id' and 'backend'.
	 * @param object target An object with properties 'id' and 'backend'.
	 */
	AddressBookList.prototype.moveContact = function(contact, from, target) {
		console.log('AddressBookList.moveContact, contact', contact, from, target);
		var self = this;
		$.when(this.storage.moveContact(from.backend, from.id, contact.getId(), {target:target}))
			.then(function(response) {
			if(!response.error) {
				console.log('Contact moved', response);
				$(document).trigger('status.contact.moved', {
					contact: contact,
					data: response.data
				});
			} else {
				$(document).trigger('status.contacts.error', response);
			}
		});
	}

	/**
	 * Get an array of address books with at least the required permission.
	 *
	 * @param int permission
	 * @param bool noClone If true the original objects will be returned and can be manipulated.
	 */
	AddressBookList.prototype.selectByPermission = function(permission, noClone) {
		var books = [];
		var self = this;
		$.each(this.addressBooks, function(idx, book) {
			if(book.getPermissions() & permission) {
				// Clone the address book not to mess with with original
				books.push(noClone ? book : $.extend(true, {}, book));
			}
		});
		return books;
	};

	/**
	 * Add a new address book.
	 *
	 * @param string name
	 * @param function cb
	 */
	AddressBookList.prototype.add = function(name, cb) {
		console.log('AddressBookList.add', name, typeof cb);
		// Check for wrong, duplicate or empty name
		if(typeof name !== 'string') {
			throw new TypeError('BadArgument: AddressBookList.add() only takes String arguments.');
		}
		if(name.trim() === '') {
			throw new Error('BadArgument: Cannot add an address book with an empty name.');
		}
		var error = '';
		$.each(this.addressBooks, function(idx, book) {
			if(book.getDisplayName() == name) {
				console.log('Dupe');
				error = t('contacts', 'An address book called {name} already exists', {name:name});
				cb({error:true, message:error});
				return false; // break loop
			}
		});
		if(error.length) {
			console.warn('Error:', error);
			return;
		}
		var self = this;
		$.when(this.storage.addAddressBook('local',
		{displayname: name, description: ''})).then(function(response) {
			if(response.error) {
				error = response.message;
				cb({error:true, message:error});
				return;
			} else {
				var book = self.insertAddressBook(response.data);
				$(document).trigger('status.addressbook.added');
				if(typeof cb === 'function') {
					cb({error:false, addressbook: book});
					return;
				}
			}
		})
		.fail(function(jqxhr, textStatus, error) {
			$(this).removeClass('loading');
			var err = textStatus + ', ' + error;
			console.log( "Request Failed: " + err);
			error = t('contacts', 'Failed adding address book: {error}', {error:err});
			cb({error:true, message:error});
			return;
		});
	};

	/**
	* Load address books
	*/
	AddressBookList.prototype.loadAddressBooks = function() {
		var self = this;
		var defer = $.Deferred();
		$.when(this.storage.getAddressBooksForUser()).then(function(response) {
			if(!response.error) {
				var num = response.data.addressbooks.length;
				$.each(response.data.addressbooks, function(idx, addressBook) {
					var book = self.insertAddressBook(addressBook);
				});
				self.buildImportSelect();
				if(typeof OC.Share !== 'undefined') {
					OC.Share.loadIcons('addressbook');
				} else {
					self.$bookList.find('a.action.share').css('display', 'none');
				}
				defer.resolve(self.addressBooks);
			} else {
				defer.reject(response);
				$(document).trigger('status.contacts.error', response);
				return false;
			}
		})
		.fail(function(jqxhr, textStatus, error) {
			var err = textStatus + ', ' + error;
			console.warn( "Request Failed: " + err);
			defer.reject({
				error: true,
				message: t('contacts', 'Failed loading address books: {error}', {error:err})
			});
		});
		return defer.promise();
	};

	OC.Contacts.AddressBookList = AddressBookList;

})(window, jQuery, OC);
